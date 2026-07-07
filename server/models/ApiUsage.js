const mongoose = require('mongoose');

/**
 * ApiUsage — a persistent per-day counter of billable external API calls.
 *
 * Used by the Google Places spend circuit-breaker (utils/apiBudget.js) so a
 * runaway loop, abuse, or a viral spike cannot silently rack up a huge Google
 * bill. Persisted (not in-memory) so the cap survives restarts and is shared
 * across processes.
 */
const apiUsageSchema = new mongoose.Schema(
  {
    // Composite of provider + UTC date, e.g. "google_places:2026-07-02".
    key: { type: String, required: true, unique: true, index: true },
    provider: { type: String, required: true },
    dateKey: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Auto-expire old daily counters after 90 days to keep the collection small.
apiUsageSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('ApiUsage', apiUsageSchema);
