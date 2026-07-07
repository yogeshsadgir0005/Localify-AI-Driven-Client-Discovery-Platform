const mongoose = require('mongoose');

/**
 * TrustLabel — ground-truth labels for the fraud/trust model. Accumulated from
 * three real sources: human review (ops adjudication), user reports, and
 * confirmed-legit signals (verified + sustained clean behaviour). The
 * classifier trains/re-trains on THESE labels; synthetic seeds are only for
 * bootstrapping and are never reported as real-world performance.
 */
const trustLabelSchema = new mongoose.Schema(
  {
    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessProfile',
      required: true,
      index: true,
    },
    label: {
      type: String,
      enum: ['fraud', 'legit', 'contested'],
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['human_review', 'user_report', 'confirmed_outcome'],
      required: true,
    },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

trustLabelSchema.index({ profile: 1, createdAt: -1 });

module.exports = mongoose.model('TrustLabel', trustLabelSchema);
