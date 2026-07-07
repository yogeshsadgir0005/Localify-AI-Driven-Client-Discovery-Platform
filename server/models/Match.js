const mongoose = require('mongoose');

/**
 * Match — a scored pairing between a Requirement and a BusinessProfile,
 * produced by services/matchingService. Persisted so shortlists are stable,
 * auditable, and feed later behavioural learning.
 */
const matchSchema = new mongoose.Schema(
  {
    requirement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Requirement',
      required: true,
      index: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessProfile',
      required: true,
    },
    fitScore: { type: Number, required: true }, // 0..1
    scoreBreakdown: {
      semantic: { type: Number, default: 0 },
      constraint: { type: Number, default: 0 },
      trust: { type: Number, default: 0 },
      responsiveness: { type: Number, default: 0 },
    },
    reasons: { type: [String], default: [] },
    reasonsBy: { type: String, default: 'template' }, // 'llm' | 'template'
    state: {
      type: String,
      enum: ['suggested', 'contacted', 'dismissed'],
      default: 'suggested',
    },
  },
  { timestamps: true }
);

// One match record per (requirement, seller) — regenerating updates in place.
matchSchema.index({ requirement: 1, seller: 1 }, { unique: true });

module.exports = mongoose.model('Match', matchSchema);
