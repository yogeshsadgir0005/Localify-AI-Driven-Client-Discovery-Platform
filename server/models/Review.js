const mongoose = require('mongoose');

/**
 * Review — a CONTACT-VERIFIED review. It is provably tied to a real
 * ContactRequest reveal (i.e. these two parties actually connected on the
 * platform). It does NOT claim the deal was good — the platform never sees the
 * transaction. A review is only published once BOTH parties confirm, in-app,
 * that they engaged (a mechanical confirmation, not a quality adjudication).
 */
const reviewSchema = new mongoose.Schema(
  {
    // Provenance: the reveal that entitles this review to exist.
    contactRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContactRequest',
      required: true,
      unique: true, // at most one review per connection
    },
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessProfile',
      required: true,
      index: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    aspects: {
      quality: { type: Number, min: 1, max: 5, default: null },
      value: { type: Number, min: 1, max: 5, default: null },
      service: { type: Number, min: 1, max: 5, default: null },
      reliability: { type: Number, min: 1, max: 5, default: null },
    },
    text: { type: String, default: '' },

    bothPartiesConfirmedEngagement: { type: Boolean, default: false },
    authenticityScore: { type: Number, default: 1 }, // down-weighted if suspicious
    status: {
      type: String,
      enum: ['pending_confirmation', 'published', 'flagged'],
      default: 'pending_confirmation',
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', reviewSchema);
