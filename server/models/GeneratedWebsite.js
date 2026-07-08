const mongoose = require('mongoose');

const generatedWebsiteSchema = new mongoose.Schema(
  {
    placeId: {
      type: String,
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    pages: {
      landing: { type: String, default: '' },
      contact: { type: String, default: '' },
      feature: { type: String, default: '' },
      html: { type: String, default: '' },  // NEW: self-contained HTML from premium template
    },
    surveyContext: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GeneratedWebsite', generatedWebsiteSchema);
