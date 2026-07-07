const Event = require('../models/Event');

/**
 * Extract a minimal actor descriptor from an Express request.
 * Works whether or not the auth middleware has run.
 */
const actorFromReq = (req) => ({
  actor: req.user?.id || null,
  actorEmail: req.user?.email || null,
  // `trust proxy` is set in server.js so req.ip reflects the real client.
  ip: req.ip || null,
});

/**
 * Record a behavioural event. Fire-and-forget by design: this never awaits,
 * never throws into the request path, and silently swallows failures (a
 * telemetry write must not be able to break a user-facing response).
 *
 * @param {import('express').Request} req
 * @param {string} verb   one of Event.VERBS
 * @param {object} [opts] { target, meta, actor, actorEmail }
 *   actor/actorEmail override the values derived from req.user — needed for
 *   public routes (login/register) where the auth middleware hasn't run.
 */
const logEvent = (req, verb, opts = {}) => {
  try {
    const derived = actorFromReq(req);
    const actor = opts.actor !== undefined ? opts.actor : derived.actor;
    const actorEmail =
      opts.actorEmail !== undefined ? opts.actorEmail : derived.actorEmail;
    Event.create({
      actor,
      actorEmail,
      verb,
      target: opts.target ?? null,
      meta: opts.meta ?? {},
      ip: derived.ip,
    }).catch((err) => {
      console.error('[telemetry] failed to record event:', err.message);
    });
  } catch (err) {
    // Guard against any synchronous failure (e.g. malformed req) — telemetry
    // is best-effort and must not interfere with the response.
    console.error('[telemetry] logEvent error:', err.message);
  }
};

module.exports = { logEvent };
