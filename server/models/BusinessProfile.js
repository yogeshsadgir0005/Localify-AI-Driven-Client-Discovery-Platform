const mongoose = require('mongoose');

/**
 * BusinessProfile — the durable, first-party seller record. This is the source
 * of truth (unlike the ephemeral SearchCache). A profile begins life as an
 * unclaimed `seed` (owner: null) materialised from Google Places, then becomes
 * `claimed` when its owner verifies control, and `verified` as trust signals
 * accrue.
 *
 * Design note: for the MVP this single model also carries freelancers (via
 * `kind: 'freelancer'` + `credentials`/`portfolio`), and the verification
 * signal ledger is embedded here rather than in a separate collection. Both
 * are pragmatic consolidations of the master plan's BusinessProfile /
 * FreelancerProfile / Verification collections; they can be split out later
 * without changing the public API.
 */

const verificationSignalSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['phone', 'email', 'gst', 'udyam', 'credential', 'kyb'],
      required: true,
    },
    verified: { type: Boolean, default: false },
    method: { type: String, default: null }, // 'otp', 'self_attested', 'document', ...
    provider: { type: String, default: null },
    // Raw reference (e.g. GSTIN) — never expose casually.
    raw: { type: String, default: null, select: false },
    caveat: { type: String, default: null }, // e.g. "self-reported; not independently verified"
    verifiedAt: { type: Date, default: null },
  },
  { _id: false }
);

const credentialSchema = new mongoose.Schema(
  {
    body: { type: String }, // ICAI, Bar Council, COA, ...
    number: { type: String },
    selfVerified: { type: Boolean, default: false },
    method: { type: String, default: 'self_attested' },
  },
  { _id: false }
);

const businessProfileSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null while the seed is unclaimed
      index: true,
    },
    kind: { type: String, enum: ['business', 'freelancer'], default: 'business' },
    source: { type: String, default: 'places_seed' }, // places_seed | self_registered
    // Only the Google place_id is retained long-term (ToS-safe); other Places
    // content is derived into first-party fields below.
    googlePlaceId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: ['seed', 'claimed', 'verified'],
      default: 'seed',
      index: true,
    },

    name: { type: String, required: true },
    description: { type: String, default: '' },
    vertical: { type: String, default: null, index: true },
    categories: { type: [String], default: [] }, // category slugs

    location: {
      address: { type: String, default: '' },
      city: { type: String, default: '' },
      district: { type: String, default: '' },
      state: { type: String, default: '' },
      geo: {
        type: { type: String, enum: ['Point'], default: undefined },
        coordinates: { type: [Number], default: undefined }, // [lng, lat]
      },
    },

    // Public contact. For seeds this is the public Google phone; email/whatsapp
    // are typically filled first-party on claim.
    contact: {
      phone: { type: String, default: null },
      email: { type: String, default: null },
      whatsapp: { type: String, default: null },
      website: { type: String, default: null },
    },

    // Structured, matchable attributes. Explicit numeric fields are used for
    // hard pre-filters; the free-form bag holds the rest.
    moqMin: { type: Number, default: null },
    moqMax: { type: Number, default: null },
    priceBand: { type: String, default: null }, // budget | mid | premium
    leadTimeDays: { type: Number, default: null },
    attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
    attributeConfidence: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Freelancer-specific (kind === 'freelancer').
    credentials: { type: [credentialSchema], default: [] },
    portfolio: { type: [String], default: [] },

    // Trust (computed by services/trustService from `verification.signals`).
    verification: {
      signals: { type: [verificationSignalSchema], default: [] },
      tier: {
        type: String,
        enum: [
          'listed',
          'phone_verified',
          'email_verified',
          'gst_verified',
          'kyb_verified',
        ],
        default: 'listed',
        index: true,
      },
      compositeScore: { type: Number, default: 0 },
      caveats: { type: [String], default: [] },
      // Moderation state (Phase 2): ok → normal; under_review/contested →
      // de-weighted in ranking; flagged → excluded from matches until resolved.
      reviewState: {
        type: String,
        enum: ['ok', 'under_review', 'contested', 'flagged'],
        default: 'ok',
        index: true,
      },
      fraudScore: { type: Number, default: 0 }, // 0..1, higher = riskier
    },

    // Abuse signals + behavioural stats (Phase 2).
    reportCount: { type: Number, default: 0 },
    stats: {
      requestsReceived: { type: Number, default: 0 },
      requestsAccepted: { type: Number, default: 0 },
      responsivenessScore: { type: Number, default: 0 }, // 0..1
    },

    // Internal (contact-verified) reviews.
    ratingAvg: { type: Number, default: null },
    reviewCount: { type: Number, default: 0 },

    // Lexical retrieval helper (text-indexed below).
    keywords: { type: [String], default: [] },
    // Optional dense vector for semantic matching (services/embeddingService).
    // Only populated when EMBEDDINGS_ENABLED; never exposed via toPublic().
    embedding: { type: [Number], default: undefined },

    // Claim flow (dev-mode OTP; never expose).
    claimPhone: { type: String, default: null, select: false },
    claimOtpHash: { type: String, default: null, select: false },
    claimOtpExpiry: { type: Date, default: null, select: false },
    claimAttempts: { type: Number, default: 0, select: false },
  },
  { timestamps: true }
);

// Lexical candidate generation (BM25-style) without any external search infra.
businessProfileSchema.index({
  name: 'text',
  description: 'text',
  keywords: 'text',
});
// Geo radius filtering when coordinates are present.
businessProfileSchema.index({ 'location.geo': '2dsphere' });
businessProfileSchema.index({ vertical: 1, status: 1 });

/**
 * Rebuild the derived lexical/keyword fields from the profile's content.
 * Call after any content change so `$text` search stays accurate.
 */
businessProfileSchema.methods.rebuildIndexFields = function rebuildIndexFields() {
  const bag = this.attributes || {};
  const attrTokens = Object.values(bag)
    .flat()
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .map(String);
  this.keywords = Array.from(
    new Set(
      [
        this.vertical,
        ...(this.categories || []),
        this.priceBand,
        ...attrTokens,
        this.location?.city,
        this.location?.state,
      ]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase())
    )
  );
};

/** A public, contact-safe projection (contact is only revealed via ContactRequest). */
businessProfileSchema.methods.toPublic = function toPublic({ includeContact = false } = {}) {
  return {
    id: this._id.toString(),
    kind: this.kind,
    status: this.status,
    name: this.name,
    description: this.description,
    vertical: this.vertical,
    categories: this.categories,
    location: {
      city: this.location?.city || '',
      district: this.location?.district || '',
      state: this.location?.state || '',
      address: this.location?.address || '',
    },
    moqMin: this.moqMin,
    moqMax: this.moqMax,
    priceBand: this.priceBand,
    leadTimeDays: this.leadTimeDays,
    attributes: this.attributes || {},
    credentials: this.credentials || [],
    trust: {
      tier: this.verification?.tier || 'listed',
      score: this.verification?.compositeScore || 0,
      caveats: this.verification?.caveats || [],
      reviewState: this.verification?.reviewState || 'ok',
    },
    ratingAvg: this.ratingAvg,
    reviewCount: this.reviewCount,
    claimed: !!this.owner,
    // Contact is withheld unless explicitly revealed to the requester.
    contact: includeContact
      ? this.contact
      : { available: !!(this.contact && (this.contact.phone || this.contact.email)) },
  };
};

module.exports = mongoose.model('BusinessProfile', businessProfileSchema);
