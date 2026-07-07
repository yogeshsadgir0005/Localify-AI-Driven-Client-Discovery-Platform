const ApiUsage = require('../models/ApiUsage');

const PROVIDER_PLACES = 'google_places';

/** Parse a positive integer env var, falling back to a default. */
const intEnv = (name, fallback) => {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** Today's date key in UTC, e.g. "2026-07-02". */
const utcDateKey = () => new Date().toISOString().slice(0, 10);

/**
 * Atomically consume `n` units of the Google Places daily budget and report
 * whether the caller is still under the configured ceiling.
 *
 * The cap comes from GOOGLE_PLACES_DAILY_CAP (default 2500 requests/day). Set
 * it to 0 to disable the circuit-breaker entirely.
 *
 * Fails OPEN: if the counter can't be read/written (e.g. Mongo blip) we allow
 * the call rather than taking search down over a telemetry problem — the goal
 * is cost protection, not a hard dependency in the request path.
 *
 * @returns {Promise<{allowed:boolean, count:number, cap:number}>}
 */
const consumePlacesQuota = async (n = 1) => {
  const cap = intEnv('GOOGLE_PLACES_DAILY_CAP', 2500);

  // Cap of 0 (or unset→default>0) — 0 means "no limit".
  if (cap === 0) return { allowed: true, count: 0, cap: 0 };

  const dateKey = utcDateKey();
  const key = `${PROVIDER_PLACES}:${dateKey}`;

  try {
    const doc = await ApiUsage.findOneAndUpdate(
      { key },
      {
        $inc: { count: n },
        $setOnInsert: { provider: PROVIDER_PLACES, dateKey },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    const count = doc?.count ?? n;
    const allowed = count <= cap;

    if (!allowed) {
      console.warn(
        `[apiBudget] Google Places daily cap reached: ${count}/${cap} (${dateKey}). Blocking further calls until UTC midnight.`
      );
    }
    return { allowed, count, cap };
  } catch (err) {
    // Fail open — do not let a counter failure break search.
    console.error('[apiBudget] usage check failed (failing open):', err.message);
    return { allowed: true, count: 0, cap };
  }
};

/** Read today's Places usage without incrementing (for health/reporting). */
const getPlacesUsage = async () => {
  const cap = intEnv('GOOGLE_PLACES_DAILY_CAP', 2500);
  const dateKey = utcDateKey();
  try {
    const doc = await ApiUsage.findOne({
      key: `${PROVIDER_PLACES}:${dateKey}`,
    }).lean();
    return { dateKey, count: doc?.count ?? 0, cap };
  } catch (err) {
    return { dateKey, count: 0, cap, error: err.message };
  }
};

module.exports = { consumePlacesQuota, getPlacesUsage };
