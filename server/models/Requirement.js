const mongoose = require('mongoose');

/**
 * Requirement — a buyer's stated need (the demand side). Captured as free text,
 * then parsed (by services/aiService) into a structured brief the matching
 * engine can filter and score against.
 */
const requirementSchema = new mongoose.Schema(
  {
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rawText: { type: String, required: true },
    // Whether the buyer wants a business or a freelancer (null = either).
    sellerKind: { type: String, enum: ['business', 'freelancer', null], default: null },

    parsed: {
      vertical: { type: String, default: null },
      categories: { type: [String], default: [] },
      keywords: { type: [String], default: [] },
      moqBand: {
        min: { type: Number, default: null },
        max: { type: Number, default: null },
      },
      budgetBand: { type: String, default: null }, // budget | mid | premium
      geo: {
        city: { type: String, default: '' },
        district: { type: String, default: '' },
        state: { type: String, default: '' },
      },
      timelineDays: { type: Number, default: null },
      parsedBy: { type: String, default: 'heuristic' }, // 'llm' | 'heuristic'
    },

    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open',
      index: true,
    },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  },
  { timestamps: true }
);

requirementSchema.index({ buyer: 1, createdAt: -1 });

module.exports = mongoose.model('Requirement', requirementSchema);
