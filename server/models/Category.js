const mongoose = require('mongoose');

/**
 * Category — the cross-industry ontology that replaces the 11 hardcoded query
 * strings. Each category belongs to a vertical, carries multilingual display
 * names and synonyms (used by requirement parsing), and describes the
 * structured attributes that matter for matching in that space.
 */
const categorySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    vertical: { type: String, required: true, index: true },
    parent: { type: String, default: null }, // parent slug, or null for a vertical root
    displayName: {
      en: { type: String, required: true },
      hi: { type: String, default: '' },
    },
    synonyms: { type: [String], default: [] },
    // Which structured attributes are meaningful here (names only; used as hints).
    attributeSchema: { type: [String], default: [] },
    hub: { type: String, default: null }, // e.g. "Surat", "Tirupur"
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
