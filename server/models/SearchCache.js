const mongoose = require('mongoose');

const searchCacheSchema = new mongoose.Schema(
  {
    cacheKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    results: {
      type: Array,
      default: [],
    },
    fetchedAt: {
      type: Date,
      default: Date.now,
    },
    // TTL index: MongoDB removes the document once `expiresAt` is in the past.
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// expireAfterSeconds: 0 means "expire exactly at the date stored in expiresAt".
searchCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SearchCache', searchCacheSchema);
