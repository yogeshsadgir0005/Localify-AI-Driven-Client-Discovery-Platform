const mongoose = require('mongoose');

/**
 * Notification — in-app alerts (the retention flywheel). Delivery is pull/in-app
 * only (TRAI-safe: no platform-driven cold push). A user fetches their own
 * notifications; nothing is sent to a phone/email without separate consent.
 */
const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'new_matching_requirement', // seller: a buyer is looking for what you offer
        'contact_revealed', // buyer: seller shared their contact
        'contact_request', // seller: a buyer requested your contact
        'saved_search_match', // buyer: a new profile matches a saved search
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
