const BusinessProfile = require('../models/BusinessProfile');
const trustService = require('./trustService');
const {
  textSearchPaged,
  placeDetails,
  runWithConcurrency,
  normalizeBusiness,
} = require('../utils/googleMaps');

/**
 * ingestionService — materialise durable, unclaimed BusinessProfile "seeds"
 * from Google Places. This is how supply is bootstrapped so the marketplace is
 * never empty. Only `place_id` is retained long-term; the rest is derived into
 * first-party fields. Billable Places calls flow through the Phase-0 spend
 * circuit-breaker in googleMaps.js.
 */

const DETAIL_FIELDS =
  'place_id,name,formatted_phone_number,international_phone_number,formatted_address,types,website,url,geometry,rating,user_ratings_total';

const normalizeLoc = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const isInCity = (place, city) => {
  const cityNorm = normalizeLoc(city);
  if (cityNorm.length < 3) return true;
  const hay = normalizeLoc(`${place.formatted_address || place.vicinity || ''} ${place.name || ''}`);
  return hay.includes(cityNorm);
};

const defaultQueries = (city, state) => {
  const loc = `${city}, ${state}, India`;
  return [
    `businesses and shops in ${loc}`,
    `manufacturers wholesalers and suppliers in ${loc}`,
    `services and professionals in ${loc}`,
  ];
};

/** Map a normalized Google business into BusinessProfile fields. */
const toProfileFields = (b, { city, district, state }) => {
  const fields = {
    source: 'places_seed',
    kind: 'business',
    status: 'seed',
    name: b.name,
    description: '',
    vertical: null,
    location: {
      address: b.address || '',
      city,
      district,
      state,
    },
    contact: {
      phone: b.phone || b.internationalPhone || null,
      website: b.website || null,
    },
    ratingAvg: null,
    reviewCount: 0,
  };
  if (b.location && Number.isFinite(b.location.lat) && Number.isFinite(b.location.lng)) {
    fields.location.geo = { type: 'Point', coordinates: [b.location.lng, b.location.lat] };
  }
  return fields;
};

/**
 * Seed profiles for a city. Idempotent: existing profiles (by googlePlaceId)
 * are updated, new ones created as unclaimed seeds. Never overwrites a claimed
 * profile's first-party fields.
 * @returns {Promise<{created:number, updated:number, scanned:number}>}
 */
const seedFromPlaces = async (city, district, state, { maxResults = 40, queries } = {}) => {
  const qs = queries && queries.length ? queries : defaultQueries(city, state);

  const settled = await Promise.allSettled(qs.map((q) => textSearchPaged(q, 2)));
  const dedup = new Map();
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    for (const place of s.value) {
      if (place.place_id && !dedup.has(place.place_id) && isInCity(place, city)) {
        dedup.set(place.place_id, place);
      }
    }
  }

  const places = [...dedup.values()].slice(0, maxResults);
  let created = 0;
  let updated = 0;

  await runWithConcurrency(places, 8, async (place) => {
    let detail;
    try {
      detail = await placeDetails(place.place_id, DETAIL_FIELDS);
    } catch {
      detail = null;
    }
    const normalized = normalizeBusiness(detail || place, { detailsPartial: !detail });
    if (!normalized.location && place.geometry) normalized.location = place.geometry.location;

    const existing = await BusinessProfile.findOne({ googlePlaceId: place.place_id });
    if (existing) {
      // Only refresh unclaimed seeds; never clobber a claimed profile.
      if (!existing.owner) {
        const fields = toProfileFields(normalized, { city, district, state });
        Object.assign(existing, fields);
        existing.rebuildIndexFields();
        trustService.recompute(existing);
        await existing.save();
        updated += 1;
      }
      return;
    }

    const profile = new BusinessProfile({
      googlePlaceId: place.place_id,
      owner: null,
      ...toProfileFields(normalized, { city, district, state }),
    });
    profile.rebuildIndexFields();
    trustService.recompute(profile);
    await profile.save();
    created += 1;
  });

  return { created, updated, scanned: places.length };
};

module.exports = { seedFromPlaces };
