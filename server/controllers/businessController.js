const NodeCache = require('node-cache');
const SearchCache = require('../models/SearchCache');
const User = require('../models/User');
const { logEvent } = require('../utils/telemetry');
const {
  GoogleMapsError,
  textSearchPaged,
  placeDetails,
  placePhoto,
  runWithConcurrency,
  normalizeBusiness,
} = require('../utils/googleMaps');

// In-memory cache for individual business details (6h TTL).
const detailCache = new NodeCache({ stdTTL: 6 * 60 * 60, checkperiod: 600 });

// Google Places ToS permits temporary caching of Places *content* for up to
// 30 days; only place_id may be retained indefinitely. Our SearchCache is a
// short-lived (24h) staging buffer, and this ceiling is a hard guard so no
// future change can push the TTL past what the ToS allows.
const MAX_PLACES_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const SEARCH_TTL_MS = Math.min(24 * 60 * 60 * 1000, MAX_PLACES_CACHE_MS);
const DETAIL_FIELDS =
  'place_id,name,formatted_phone_number,international_phone_number,formatted_address,rating,user_ratings_total,opening_hours,types,website,url';
const FULL_DETAIL_FIELDS =
  'place_id,name,formatted_phone_number,international_phone_number,formatted_address,rating,user_ratings_total,opening_hours,types,business_status,url,website,geometry,reviews,photos';
const MAX_CONCURRENT_DETAILS = 10;

/**
 * Fetch (and cache) full details for a single business.
 * Shared with the summary controller so summaries reuse cached data.
 * Returns a normalized business object, or null if not found.
 */
const getDetailCached = async (placeId) => {
  const cacheKey = `detail:${placeId}`;
  const hit = detailCache.get(cacheKey);
  if (hit) return hit;

  const raw = await placeDetails(placeId, FULL_DETAIL_FIELDS);
  if (!raw) return null;

  const normalized = normalizeBusiness(raw);
  detailCache.set(cacheKey, normalized);
  return normalized;
};

/**
 * Build a broad set of category queries so we cover shops, malls, restaurants,
 * services, healthcare, etc. — not just one narrow search. Each runs as its own
 * Google Places text search; results are merged and de-duplicated by place_id.
 *
 * We lead with the city/taluka + state (district is intentionally left out) so
 * Google biases toward the specific town instead of the larger district city.
 */
const buildQueries = (city, state, country = 'India') => {
  const loc = `${city}, ${state}, ${country}`;
  return [
    `shops and stores in ${loc}`,
    `shopping malls and markets in ${loc}`,
    `restaurants hotels cafes and food in ${loc}`,
    `grocery and general stores in ${loc}`,
    `clinics hospitals and pharmacies in ${loc}`,
    `salons beauty spa and repair services in ${loc}`,
    `electronics mobile and hardware shops in ${loc}`,
    `clothing footwear and jewellery shops in ${loc}`,
    `schools colleges and coaching classes in ${loc}`,
    `automobile garages and petrol pumps in ${loc}`,
    `local businesses in ${loc}`,
  ];
};

const MAX_RESULTS = 350; // cap how many we enrich with details per search

/** Normalize a string for loose location matching (lowercase, alphanumeric). */
const normalizeLoc = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Keep only places that actually belong to the searched city/taluka. Google's
 * text search bleeds in nearby district results, so we require the city name to
 * appear in the place's address (or name). Filtering here — before fetching
 * details — also keeps API cost down.
 */
const isInCity = (place, city) => {
  const cityNorm = normalizeLoc(city);
  if (cityNorm.length < 3) return true; // too short to match reliably; keep all
  const haystack = normalizeLoc(
    `${place.formatted_address || place.vicinity || ''} ${place.name || ''}`
  );
  return haystack.includes(cityNorm);
};

/** Build the API response payload for a result set (cached or fresh). */
const buildSearchPayload = (results, extra = {}) => ({
  success: true,
  total: extra.total ?? results.length,
  noWebsiteCount: extra.noWebsiteCount ?? results.filter((b) => !b.website).length,
  results,
  emailNote: 'Email discovery via web scraping is not available in free tier.',
  ...extra,
});

/**
 * GET /api/business/search?city=&district=&state=  [protected]
 * Returns ALL discoverable local businesses (shops, malls, restaurants,
 * services, …). Each result carries a `website` field so the client can
 * optionally filter to website-less ("offline-only") businesses.
 */
const searchBusinesses = async (req, res, next) => {
  try {
    const country = (req.query.country || 'India').trim();
    const city = (req.query.city || '').trim();
    const district = (req.query.district || '').trim();
    const state = (req.query.state || '').trim();

    if (!city || !district || !state) {
      return res.status(400).json({
        success: false,
        message: 'city, district and state query parameters are required.',
      });
    }

    // Bump this suffix whenever the query/category set changes, to invalidate
    // older cached result sets.
    const cacheKey =
      `v5:country:${country}:city:${city}:district:${district}:state:${state}`.toLowerCase();

    // 1) Persistent cache lookup (stores the full enriched set).
    const cached = await SearchCache.findOne({
      cacheKey,
      expiresAt: { $gt: new Date() },
    }).lean();

    // Determine user plan limit
    const user = await User.findById(req.user.id).select('plan');
    const plan = user?.plan || 'free';
    let resultLimit = 6;
    if (plan === 'pro') resultLimit = 60;
    if (plan === 'max') resultLimit = Infinity;

    if (cached) {
      logEvent(req, 'search', {
        target: cacheKey,
        meta: { city, district, state, total: cached.results.length, cached: true },
      });
      res.set('Cache-Control', 'public, max-age=3600');
      
      const slicedResults = cached.results.slice(0, resultLimit);
      
      return res.json(
        buildSearchPayload(slicedResults, {
          cached: true,
          fetchedAt: cached.fetchedAt,
          country,
          city,
          district,
          state,
          total: cached.results.length, // keep true total
          noWebsiteCount: cached.results.filter((b) => !b.website).length,
          hasLockedResults: cached.results.length > resultLimit,
        })
      );
    }

    // 2) Fan out across category queries (each paginated up to ~60 results).
    const queries = buildQueries(city, state, country);
    let mapsError = null;
    const dedup = new Map();

    // 3 pages per query to maximize coverage.
    const searches = await Promise.allSettled(
      queries.map((q) => textSearchPaged(q, 3))
    );

    for (const s of searches) {
      if (s.status === 'fulfilled') {
        for (const place of s.value) {
          // Scope strictly to the searched city/taluka, and de-duplicate.
          if (
            place.place_id &&
            !dedup.has(place.place_id) &&
            isInCity(place, city)
          ) {
            dedup.set(place.place_id, place);
          }
        }
      } else if (s.reason instanceof GoogleMapsError) {
        mapsError = s.reason;
      } else {
        console.error('[business] search query failed:', s.reason?.message);
      }
    }

    // If every query failed with a Maps error, surface it.
    if (dedup.size === 0 && mapsError) {
      if (mapsError.code === 'MAPS_QUOTA') {
        return res.status(503).json({
          success: false,
          message: 'Search temporarily unavailable. Please try again later.',
        });
      }
      const payload = {
        success: false,
        message: 'Search is unavailable right now. Please try again later.',
      };
      if (process.env.NODE_ENV !== 'production') {
        payload.code = mapsError.code;
        payload.detail = mapsError.details || mapsError.message;
      }
      return res.status(mapsError.statusCode).json(payload);
    }

    const places = [...dedup.values()].slice(0, MAX_RESULTS);

    if (!places.length) {
      logEvent(req, 'search', {
        target: cacheKey,
        meta: { city, district, state, total: 0, cached: false },
      });
      return res.json(
        buildSearchPayload([], {
          cached: false,
          city,
          district,
          state,
          message:
            'No businesses found. Please check the spelling of your city or try a nearby one.',
        })
      );
    }

    // 3) Enrich each place with details (phone, website, hours) in parallel.
    const settled = await runWithConcurrency(
      places,
      MAX_CONCURRENT_DETAILS,
      async (place) => {
        try {
          const detail = await placeDetails(place.place_id, DETAIL_FIELDS);
          if (!detail) return normalizeBusiness(place, { detailsPartial: true });
          // Preserve geometry from the text-search payload (details query above
          // omits it) so map links keep working.
          if (!detail.geometry && place.geometry) detail.geometry = place.geometry;
          return normalizeBusiness(detail);
        } catch (detailErr) {
          return normalizeBusiness(place, { detailsPartial: true });
        }
      }
    );

    const enriched = settled
      .filter((s) => s.status === 'fulfilled' && s.value)
      .map((s) => s.value)
      // Surface the most prominent businesses first.
      .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));

    // 4) Persist the full set to the cache (24h TTL). Best-effort.
    const fetchedAt = new Date();
    try {
      await SearchCache.findOneAndUpdate(
        { cacheKey },
        {
          cacheKey,
          results: enriched,
          fetchedAt,
          expiresAt: new Date(Date.now() + SEARCH_TTL_MS),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (cacheErr) {
      console.error('[business] Failed to write search cache:', cacheErr.message);
    }

    logEvent(req, 'search', {
      target: cacheKey,
      meta: { city, district, state, total: enriched.length, cached: false },
    });
    const slicedEnriched = enriched.slice(0, resultLimit);

    res.set('Cache-Control', 'public, max-age=3600');
    return res.json(
      buildSearchPayload(slicedEnriched, {
        cached: false,
        fetchedAt,
        country,
        city,
        district,
        state,
        total: enriched.length, // keep true total
        noWebsiteCount: enriched.filter((b) => !b.website).length,
        hasLockedResults: enriched.length > resultLimit,
      })
    );
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/business/:placeId  [protected]
 */
const getBusinessDetail = async (req, res, next) => {
  try {
    const { placeId } = req.params;
    if (!placeId || placeId.length < 5) {
      return res
        .status(400)
        .json({ success: false, message: 'A valid placeId is required.' });
    }

    let business;
    try {
      business = await getDetailCached(placeId);
    } catch (err) {
      if (err instanceof GoogleMapsError) {
        if (err.code === 'MAPS_QUOTA') {
          return res.status(503).json({
            success: false,
            message: 'Details temporarily unavailable. Please try again later.',
          });
        }
        return res.status(err.statusCode).json({
          success: false,
          message: 'Could not load business details right now.',
        });
      }
      throw err;
    }

    if (!business) {
      return res
        .status(404)
        .json({ success: false, message: 'Business not found.' });
    }

    logEvent(req, 'view_business', {
      target: placeId,
      meta: { name: business.name || null, hasWebsite: !!business.website },
    });
    res.set('Cache-Control', 'public, max-age=3600');
    return res.json({ success: true, business });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/business/photo?ref=&maxwidth=   [public]
 * Proxies a Google Place Photo so the API key never reaches the client.
 * Public on purpose: <img> tags cannot send an Authorization header.
 */
const getBusinessPhoto = async (req, res) => {
  const ref = (req.query.ref || '').trim();
  const maxwidth = Math.min(
    Math.max(parseInt(req.query.maxwidth, 10) || 600, 100),
    1200
  );

  if (!ref) {
    return res
      .status(400)
      .json({ success: false, message: 'A photo reference is required.' });
  }

  try {
    const { contentType, data } = await placePhoto(ref, maxwidth);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400'); // cache images for a day
    // helmet() defaults Cross-Origin-Resource-Policy to "same-origin", which
    // makes the browser BLOCK this image when the client is served from a
    // different origin (e.g. Vite :5173 → API :5000/:5001). Photos are public
    // Google content proxied through us, so allow cross-origin embedding.
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.send(data);
  } catch (err) {
    console.error('[business] photo proxy error:', err.message);
    return res
      .status(502)
      .json({ success: false, message: 'Could not load photo.' });
  }
};

module.exports = {
  searchBusinesses,
  getBusinessDetail,
  getBusinessPhoto,
  getDetailCached,
};
