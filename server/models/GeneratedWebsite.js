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
      html: { type: String, default: '' },  // self-contained HTML
    },
    surveyContext: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Multi-Agent Pipeline Data
    intermediateSpecs: { type: mongoose.Schema.Types.Mixed, default: {} },
    qualityScores: { type: mongoose.Schema.Types.Mixed, default: {} },
    qaReports: { type: Array, default: [] },
    pipelineMetrics: { type: mongoose.Schema.Types.Mixed, default: {} },
    promptVersion: { type: String, default: '1.0' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GeneratedWebsite', generatedWebsiteSchema);
