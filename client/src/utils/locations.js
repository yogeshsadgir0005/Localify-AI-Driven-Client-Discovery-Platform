/**
 * Global location utilities — powered by the country-state-city package.
 * Replaces the old India-only `india.js` with worldwide coverage:
 *   250+ countries · 5 000+ states/regions · 150 000+ cities.
 */

import { Country, State, City } from 'country-state-city';

/* -----------------------------------------------------------------------
 * Countries
 * --------------------------------------------------------------------- */

/** Sorted array of { value (isoCode), label (name) } for every country. */
export const COUNTRIES = Country.getAllCountries()
  .map((c) => ({ value: c.isoCode, label: c.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

/**
 * Resolve a country ISO code to its display label.
 */
export const getCountryLabel = (isoCode) => {
  if (!isoCode) return '';
  const country = Country.getCountryByCode(isoCode);
  return country ? country.name : isoCode;
};

/* -----------------------------------------------------------------------
 * States / Regions
 * --------------------------------------------------------------------- */

/**
 * Get states/regions for a given country ISO code.
 * Returns a sorted array of { value (isoCode), label (name) }.
 */
export const getStates = (countryCode) => {
  if (!countryCode) return [];
  return State.getStatesOfCountry(countryCode)
    .map((s) => ({ value: s.isoCode, label: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

/**
 * Resolve a state ISO code to its display label.
 */
export const getStateLabel = (stateCode, countryCode) => {
  if (!stateCode) return '';
  if (!countryCode) return stateCode; // fallback for legacy data
  const state = State.getStateByCodeAndCountry(stateCode, countryCode);
  return state ? state.name : stateCode;
};

/* -----------------------------------------------------------------------
 * Cities
 * --------------------------------------------------------------------- */

/**
 * Get cities for a given country + state code pair.
 * Returns a sorted array of city name strings.
 */
export const getCities = (countryCode, stateCode) => {
  if (!countryCode || !stateCode) return [];
  return City.getCitiesOfState(countryCode, stateCode)
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b.label));
};

/* -----------------------------------------------------------------------
 * Backward compatibility helpers
 * --------------------------------------------------------------------- */

/**
 * Legacy helper — maps old india.js slugs (e.g. 'maharashtra') to readable
 * labels. Falls back to the raw value so existing user data still renders.
 */
const LEGACY_STATE_MAP = {
  'andhra-pradesh': 'Andhra Pradesh',
  'arunachal-pradesh': 'Arunachal Pradesh',
  assam: 'Assam',
  bihar: 'Bihar',
  chhattisgarh: 'Chhattisgarh',
  goa: 'Goa',
  gujarat: 'Gujarat',
  haryana: 'Haryana',
  'himachal-pradesh': 'Himachal Pradesh',
  jharkhand: 'Jharkhand',
  karnataka: 'Karnataka',
  kerala: 'Kerala',
  'madhya-pradesh': 'Madhya Pradesh',
  maharashtra: 'Maharashtra',
  manipur: 'Manipur',
  meghalaya: 'Meghalaya',
  mizoram: 'Mizoram',
  nagaland: 'Nagaland',
  odisha: 'Odisha',
  punjab: 'Punjab',
  rajasthan: 'Rajasthan',
  sikkim: 'Sikkim',
  'tamil-nadu': 'Tamil Nadu',
  telangana: 'Telangana',
  tripura: 'Tripura',
  'uttar-pradesh': 'Uttar Pradesh',
  uttarakhand: 'Uttarakhand',
  'west-bengal': 'West Bengal',
  'andaman-and-nicobar-islands': 'Andaman and Nicobar Islands',
  chandigarh: 'Chandigarh',
  'dadra-and-nagar-haveli-and-daman-and-diu': 'Dadra and Nagar Haveli and Daman and Diu',
  delhi: 'Delhi (NCT)',
  'jammu-and-kashmir': 'Jammu and Kashmir',
  ladakh: 'Ladakh',
  lakshadweep: 'Lakshadweep',
  puducherry: 'Puducherry',
};

/**
 * Smart state label resolver — handles both new ISO codes and legacy slugs.
 */
export const getStateLabelSmart = (stateValue, countryCode) => {
  // Try legacy map first (for existing Indian users with old slug data)
  if (LEGACY_STATE_MAP[stateValue]) return LEGACY_STATE_MAP[stateValue];
  // Try the proper ISO lookup
  return getStateLabel(stateValue, countryCode);
};
