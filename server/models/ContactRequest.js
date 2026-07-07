const mongoose = require('mongoose');

/**
 * ContactRequest — the terminal "connection". A buyer requests contact with a
 * seller profile; the reveal is where the platform's job ENDS.
 *
 * Two paths:
 *  - Unclaimed seed (owner: null): the contact is already public (from Google),
 *    so the request resolves straight to `revealed` with business-level info.
 *  - Claimed profile (has owner): requires the seller's mutual opt-in
 *    (`accepted`) before the contact is `revealed`.
 *
 * Nothing here touches payments, quotes, or delivery — those are off-platform.
 */
const contactRequestSchema = new mongoose.Schema(
  {
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    toProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessProfile',
      required: true,
      index: true,
    },
    toOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null when the target profile is an unclaimed seed
    },
    requirement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Requirement',
      default: null,
    },
    requirementSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    intentScore: { type: Number, default: null },

    // Bounded pre-reveal message (phone/email auto-redacted before storage).
    message: { type: String, default: '' },
    preRevealThreadOpened: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'revealed', 'expired'],
      default: 'pending',
      index: true,
    },
    contactRevealedAt: { type: Date, default: null },
    revealedContact: { type: mongoose.Schema.Types.Mixed, default: null },
    // AI-drafted intro handed to the buyer to send themselves (never auto-sent).
    draftedMessage: { type: String, default: null },

    // Mutual post-reveal engagement confirmation (gates review eligibility).
    engagementConfirmedByBuyer: { type: Boolean, default: false },
    engagementConfirmedBySeller: { type: Boolean, default: false },
  },
  { timestamps: true }
);

contactRequestSchema.index({ fromUser: 1, toProfile: 1 });
contactRequestSchema.index({ toOwner: 1, status: 1 });

module.exports = mongoose.model('ContactRequest', contactRequestSchema);
