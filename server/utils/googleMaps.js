const axios = require('axios');
const { consumePlacesQuota } = require('./apiBudget');

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

/**
 * A typed error for Google Maps failures so the controller can map them to
 * the correct HTTP status without leaking key/quota details to the client.
 */
class GoogleMapsError extends Error {
  constructor(message, { status = 502, code = 'MAPS_ERROR', details = null } = {}) {
    super(message);
    this.name = 'GoogleMapsError';
    this.statusCode = status;
    this.code = code;
    // The raw reason from Google (e.g. "You must enable Billing..."), surfaced
    // in development only by the controllers.
    this.details = details;
  }
}

const getApiKey = () => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new GoogleMapsError('Google Maps API key is not configured.', {
      status: 500,
      code: 'MAPS_NO_KEY',
    });
  }
  return key;
};

/**
 * Translate a Google Places API `status` field into our error model.
 * Returns null when the status is acceptable (OK or ZERO_RESULTS).
 */
const interpretStatus = (status, errorMessage) => {
  switch (status) {
    case 'OK':
    case 'ZERO_RESULTS':
      return null;
    case 'OVER_QUERY_LIMIT':
    case 'RESOURCE_EXHAUSTED':
      return new GoogleMapsError('Maps quota exceeded.', {
        status: 503,
        code: 'MAPS_QUOTA',
      });
    case 'REQUEST_DENIED':
      // Usually an invalid/unauthorized API key, disabled API, or billing not
      // enabled. Log the full reason server-side for debugging.
      console.error('[googleMaps] REQUEST_DENIED:', errorMessage || '(no message)');
      return new GoogleMapsError('Maps request was denied.', {
        status: 502,
        code: 'MAPS_DENIED',
        details: errorMessage || null,
      });
    case 'INVALID_REQUEST':
      return new GoogleMapsError('Invalid maps request.', {
        status: 400,
        code: 'MAPS_INVALID',
        details: errorMessage || null,
      });
    default:
      console.error('[googleMaps] Unexpected status:', status, errorMessage);
      return new GoogleMapsError('Maps service error.', {
        status: 502,
        code: 'MAPS_UNKNOWN',
        details: errorMessage || null,
      });
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Spend circuit-breaker: consume one unit of the daily Google Places budget
 * and abort (as a quota error) if the configured cap has been exceeded. Called
 * before every billable request to Google so a runaway loop or abuse can't run
 * up the bill. Fails open if the counter itself is unavailable.
 */
const guardPlacesBudget = async () => {
  const { allowed, count, cap } = await consumePlacesQuota(1);
  if (!allowed) {
    throw new GoogleMapsError('Daily Places budget exhausted.', {
      status: 503,
      code: 'MAPS_QUOTA',
      details: `daily Places calls ${count} exceeded cap ${cap}`,
    });
  }
};

/**
 * Text Search for places. Returns the raw `results` array (possibly empty).
 */
const textSearch = async (query) => {
  const key = getApiKey();
  await guardPlacesBudget();
  let data;
  try {
    const res = await axios.get(`${PLACES_BASE}/textsearch/json`, {
      params: { query, key, region: 'in' },
      timeout: 15000,
    });
    data = res.data;
  } catch (err) {
    console.error('[googleMaps] textSearch network error:', err.message);
    throw new GoogleMapsError('Could not reach the maps service.', {
      status: 503,
      code: 'MAPS_NETWORK',
    });
  }

  const statusError = interpretStatus(data.status, data.error_message);
  if (statusError) throw statusError;

  return Array.isArray(data.results) ? data.results : [];
};

/**
 * Paginated Text Search. Follows `next_page_token` up to `maxPages` (each page
 * returns up to 20 results, so 3 pages ≈ 60 results per query).
 * Google requires a short delay before a next_page_token becomes valid.
 * If a later page fails, whatever was collected so far is returned.
 */
const textSearchPaged = async (query, maxPages = 3) => {
  const key = getApiKey();
  let all = [];
  let pageToken;

  for (let page = 0; page < maxPages; page += 1) {
    // Count each page fetch against the daily budget. If the cap is hit
    // mid-pagination, return whatever we have already collected; otherwise
    // surface the quota error.
    try {
      // eslint-disable-next-line no-await-in-loop
      await guardPlacesBudget();
    } catch (budgetErr) {
      if (all.length) break;
      throw budgetErr;
    }

    let data;
    try {
      const params = pageToken
        ? { pagetoken: pageToken, key }
        : { query, key, region: 'in' };
      // eslint-disable-next-line no-await-in-loop
      const res = await axios.get(`${PLACES_BASE}/textsearch/json`, {
        params,
        timeout: 15000,
      });
      data = res.data;
    } catch (err) {
      console.error('[googleMaps] textSearchPaged network error:', err.message);
      if (all.length) break;
      throw new GoogleMapsError('Could not reach the maps service.', {
        status: 503,
        code: 'MAPS_NETWORK',
      });
    }

    const statusError = interpretStatus(data.status, data.error_message);
    if (statusError) {
      if (all.length) break;
      throw statusError;
    }

    if (Array.isArray(data.results)) all = all.concat(data.results);

    pageToken = data.next_page_token;
    if (!pageToken) break;
    // next_page_token is not immediately valid — wait briefly before reusing it.
    // eslint-disable-next-line no-await-in-loop
    await sleep(2000);
  }

  return all;
};

/**
 * Fetch detailed information for a single place_id.
 * Returns the `result` object, or null if not found.
 */
const placeDetails = async (placeId, fields) => {
  const key = getApiKey();
  await guardPlacesBudget();
  let data;
  try {
    const res = await axios.get(`${PLACES_BASE}/details/json`, {
      params: { place_id: placeId, fields, key },
      timeout: 15000,
    });
    data = res.data;
  } catch (err) {
    console.error('[googleMaps] placeDetails network error:', err.message);
    throw new GoogleMapsError('Could not reach the maps service.', {
      status: 503,
      code: 'MAPS_NETWORK',
    });
  }

  if (data.status === 'NOT_FOUND' || data.status === 'ZERO_RESULTS') {
    return null;
  }

  const statusError = interpretStatus(data.status, data.error_message);
  if (statusError) throw statusError;

  return data.result || null;
};

/**
 * Run an array of async tasks with a bounded concurrency limit, using
 * Promise.allSettled semantics. Returns an array of settled results that
 * preserves input order.
 */
const runWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = new Array(Math.min(limit, items.length))
    .fill(null)
    .map(async () => {
      // Each runner pulls the next index until the queue is drained.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) break;
        try {
          const value = await worker(items[index], index);
          results[index] = { status: 'fulfilled', value };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    });

  await Promise.all(runners);
  return results;
};

/**
 * Map a raw Google place/result into our normalized business shape.
 */
const normalizeBusiness = (raw, { detailsPartial = false } = {}) => {
  const types = Array.isArray(raw.types) ? raw.types : [];
  return {
    placeId: raw.place_id,
    name: raw.name || 'Unknown business',
    address: raw.formatted_address || raw.vicinity || '',
    phone: raw.formatted_phone_number || raw.international_phone_number || null,
    internationalPhone: raw.international_phone_number || null,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    reviewCount:
      typeof raw.user_ratings_total === 'number' ? raw.user_ratings_total : 0,
    types,
    openingHours: raw.opening_hours
      ? {
          openNow:
            typeof raw.opening_hours.open_now === 'boolean'
              ? raw.opening_hours.open_now
              : null,
          weekdayText: raw.opening_hours.weekday_text || [],
        }
      : null,
    businessStatus: raw.business_status || null,
    googleUrl: raw.url || null,
    website: raw.website || null,
    location: raw.geometry?.location || null,
    // Google Places does not expose emails on the free tier.
    email: null,
    // Up to 5 reviews and a handful of photo references (detail responses only).
    reviews: Array.isArray(raw.reviews)
      ? raw.reviews.slice(0, 5).map((r) => ({
          author: r.author_name || 'Anonymous',
          rating: typeof r.rating === 'number' ? r.rating : null,
          text: r.text || '',
          relativeTime: r.relative_time_description || '',
          profilePhoto: r.profile_photo_url || '',
        }))
      : [],
    photos: Array.isArray(raw.photos)
      ? raw.photos.slice(0, 8).map((p) => ({
          ref: p.photo_reference,
          width: p.width || null,
          height: p.height || null,
        }))
      : [],
    detailsPartial,
  };
};

/**
 * Fetch a Place Photo binary by reference (proxied so the API key stays server
 * side). Returns { contentType, data:Buffer }.
 */
const placePhoto = async (photoRef, maxwidth = 600) => {
  const key = getApiKey();
  await guardPlacesBudget();
  const res = await axios.get(`${PLACES_BASE}/photo`, {
    params: { maxwidth, photo_reference: photoRef, key },
    responseType: 'arraybuffer',
    timeout: 15000,
    // Google 302-redirects to the actual image host; axios follows by default.
  });
  return {
    contentType: res.headers['content-type'] || 'image/jpeg',
    data: Buffer.from(res.data),
  };
};

module.exports = {
  GoogleMapsError,
  textSearch,
  textSearchPaged,
  placeDetails,
  placePhoto,
  runWithConcurrency,
  normalizeBusiness,
};
