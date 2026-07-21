import { API_BASE } from '../api/client';

// Images must load over HTTPS on iOS (the native image loader blocks plain
// http:// even when API calls succeed). Prefer a dedicated media base or the
// https OAuth/tunnel base; fall back to the API base.
const MEDIA_BASE = (
  process.env.EXPO_PUBLIC_MEDIA_BASE_URL ||
  process.env.EXPO_PUBLIC_OAUTH_BASE_URL ||
  API_BASE
).replace(/\/+$/, '');

// Same photo proxy the website uses: /api/business/photo?ref=...&maxwidth=...
export const photoUrl = (ref, width = 600) =>
  ref ? `${MEDIA_BASE}/business/photo?ref=${encodeURIComponent(ref)}&maxwidth=${width}` : null;

// Coarse UI category from Google Places types (mirrors the web client).
const CATEGORY_RULES = [
  { key: 'Restaurants', match: ['restaurant', 'cafe', 'food', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery'] },
  { key: 'Shops', match: ['store', 'shop', 'clothing_store', 'shoe_store', 'grocery_or_supermarket', 'supermarket', 'hardware_store', 'furniture_store', 'electronics_store', 'book_store', 'jewelry_store', 'convenience_store'] },
  { key: 'Services', match: ['beauty_salon', 'hair_care', 'laundry', 'car_repair', 'plumber', 'electrician', 'painter', 'locksmith', 'spa', 'travel_agency', 'real_estate_agency', 'bank', 'atm', 'gym'] },
  { key: 'Healthcare', match: ['hospital', 'doctor', 'pharmacy', 'dentist', 'physiotherapist', 'veterinary_care', 'health'] },
  { key: 'Education', match: ['school', 'university', 'primary_school', 'secondary_school', 'library'] },
];

export const CATEGORIES = ['All', 'Restaurants', 'Shops', 'Services', 'Healthcare', 'Education', 'Others'];

export const categoryOf = (business) => {
  const types = business?.types || [];
  for (const rule of CATEGORY_RULES) {
    if (types.some((t) => rule.match.includes(t))) return rule.key;
  }
  return 'Others';
};
