const mongoose = require('mongoose');

/**
 * Event — the product's behavioural telemetry stream.
 *
 * Every meaningful action (search, business view, auth, contact intent) is
 * recorded here as an append-only event. This is Phase-0 groundwork: lead
 * scoring, matching quality, funnel analytics and trust signals in later
 * phases all read from this stream, so we start capturing it from day one.
 *
 * Writes are fire-and-forget (see utils/telemetry.js) — logging must never
 * block or fail a user request.
 */

// Keep the verb set explicit so analytics stay clean. Extend as new surfaces
// (claim, contact_request, reveal, review, reported, …) come online.
const VERBS = [
  'search',
  'view_business',
  'view_photo',
  'ai_summary',
  'ai_outreach',
  'review_insights',
  'register',
  'login',
  'google_login',
  'update_address',
  'consent_update',
  'grievance_submitted',
  'trust_appeal',
  'profile_seed',
  'profile_claim',
  'requirement_create',
  'match_generate',
  'contact_request',
  'contact_reveal',
  'review_create',
  'report_profile',
  'moderation_action',
  'profile_merge',
];

const eventSchema = new mongoose.Schema(
  {
    // The acting user, when known. Null for anonymous/public actions.
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    actorEmail: { type: String, default: null },
    verb: {
      type: String,
      required: true,
      enum: VERBS,
      index: true,
    },
    // A loose target identifier: a placeId, a search key, etc.
    target: { type: String, default: null },
    // Free-form structured context (query params, result counts, language…).
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
  },
  { timestamps: true }
);

// Common query patterns: recent events, per-user timelines, per-verb funnels.
eventSchema.index({ createdAt: -1 });
eventSchema.index({ verb: 1, createdAt: -1 });
eventSchema.index({ actor: 1, createdAt: -1 });

// Optional retention cap. Set EVENT_RETENTION_DAYS to auto-expire raw events
// after N days (aggregate rollups, added later, are what we keep long-term).
// Left unset = keep everything.
const retentionDays = parseInt(process.env.EVENT_RETENTION_DAYS, 10);
if (Number.isFinite(retentionDays) && retentionDays > 0) {
  eventSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: retentionDays * 24 * 60 * 60 }
  );
}

eventSchema.statics.VERBS = VERBS;

module.exports = mongoose.model('Event', eventSchema);
