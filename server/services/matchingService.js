const BusinessProfile = require('../models/BusinessProfile');
const Match = require('../models/Match');
const aiService = require('./aiService');
const hostedAiService = require('./hostedAiService');
const embeddingService = require('./embeddingService');

/**
 * matchingService — content-based, cold-start matching (no interaction history
 * needed at launch). Pipeline:
 *   (A) hard pre-filter  → (B) lexical candidate gen ($text)  →
 *   (C) blended fit score → (D) explainable reasons → persist Match docs.
 *
 * Retrieval is lexical ($text / BM25-style) for the MVP. The dense/vector
 * (bge-m3 + Atlas Vector Search) half is the Phase-2 upgrade and slots into
 * step B without changing this contract.
 */

const TIER_LABEL = {
  listed: 'Listed',
  phone_verified: 'Phone-verified',
  email_verified: 'Email-verified',
  gst_verified: 'GST-verified',
  kyb_verified: 'KYB-verified',
};

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/** Build the hard pre-filter from a parsed requirement. */
const buildFilter = (req) => {
  const p = req.parsed || {};
  const filter = { status: { $in: ['seed', 'claimed', 'verified'] } };
  // Moderation: flagged profiles are excluded outright (under_review/contested
  // stay in but are de-weighted via their reduced trust score).
  filter['verification.reviewState'] = { $ne: 'flagged' };

  if (req.sellerKind) filter.kind = req.sellerKind;

  // Vertical: prefer an exact match but don't exclude unclassified seeds.
  if (p.vertical) filter.$or = [{ vertical: p.vertical }, { vertical: null }];

  // Geo: hard-filter by state when known (city is scored, not filtered).
  if (p.geo?.state) {
    filter['location.state'] = new RegExp(
      `^${p.geo.state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      'i'
    );
  }

  // MOQ: a seller fits if their minimum order is unknown or <= the buyer's order.
  const buyerMoq = p.moqBand?.min;
  if (Number.isFinite(buyerMoq)) {
    filter.$and = [{ $or: [{ moqMin: null }, { moqMin: { $lte: buyerMoq } }] }];
  }
  return filter;
};

/** Build the lexical search string. */
const buildSearchString = (req) => {
  const p = req.parsed || {};
  return Array.from(
    new Set([...(p.keywords || []), ...(p.categories || [])])
  )
    .join(' ')
    .trim();
};

/** Fetch up to `poolSize` candidates: $text-ranked, else trust-ranked. */
const fetchCandidates = async (filter, searchStr, poolSize) => {
  if (searchStr) {
    const textHits = await BusinessProfile.find(
      { ...filter, $text: { $search: searchStr } },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(poolSize)
      .lean();
    if (textHits.length) return { candidates: textHits, hasText: true };
  }
  const fallback = await BusinessProfile.find(filter)
    .sort({ 'verification.compositeScore': -1, reviewCount: -1 })
    .limit(poolSize)
    .lean();
  return { candidates: fallback, hasText: false };
};

/** Score one candidate against the requirement. Returns {breakdown, reasons}. */
const scoreCandidate = (req, c, semantic) => {
  const p = req.parsed || {};
  const reasons = [];
  const parts = [];

  // Vertical
  if (p.vertical) {
    if (c.vertical === p.vertical) {
      parts.push(1);
      reasons.push(`Works in ${p.vertical}`);
    } else parts.push(0.5);
  }

  // Category overlap
  if (p.categories?.length) {
    const overlap = (c.categories || []).filter((s) => p.categories.includes(s));
    if (overlap.length) {
      parts.push(1);
      reasons.push(`Offers ${overlap[0]}`);
    } else parts.push(0.3);
  }

  // MOQ fit
  const buyerMoq = p.moqBand?.min;
  if (Number.isFinite(buyerMoq)) {
    if (c.moqMin == null) parts.push(0.7);
    else if (c.moqMin <= buyerMoq) {
      parts.push(1);
      reasons.push(`Can handle your ~${buyerMoq}-unit order`);
    } else parts.push(0);
  }

  // Geo
  if (p.geo?.city) {
    if ((c.location?.city || '').toLowerCase() === p.geo.city.toLowerCase()) {
      parts.push(1);
      reasons.push(`Located in ${c.location.city}`);
    } else parts.push(0.5);
  }

  // Budget
  if (p.budgetBand) {
    if (c.priceBand === p.budgetBand) {
      parts.push(1);
      reasons.push(`${p.budgetBand} price range`);
    } else parts.push(c.priceBand == null ? 0.6 : 0.3);
  }

  const constraint = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0.6;
  const trust = clamp01((c.verification?.compositeScore || 0) / 100);
  // Behavioural signal (Phase 2): how reliably this seller responds to requests.
  const responsiveness = clamp01(c.stats?.responsivenessScore || 0);

  const fitScore =
    0.45 * semantic + 0.25 * constraint + 0.2 * trust + 0.1 * responsiveness;

  // Trust + review reasons
  const tier = c.verification?.tier || 'listed';
  if (tier !== 'listed') reasons.push(TIER_LABEL[tier]);
  if ((c.reviewCount || 0) > 0) {
    reasons.push(
      `${c.reviewCount} verified review${c.reviewCount > 1 ? 's' : ''}${
        c.ratingAvg != null ? `, ${c.ratingAvg.toFixed(1)}★` : ''
      }`
    );
  }

  return {
    fitScore: clamp01(fitScore),
    breakdown: {
      semantic: Number(semantic.toFixed(3)),
      constraint: Number(constraint.toFixed(3)),
      trust: Number(trust.toFixed(3)),
      responsiveness,
    },
    reasons: reasons.slice(0, 4),
  };
};

/** Contact-safe summary of a candidate for the shortlist. */
const summarize = (c) => ({
  id: c._id.toString(),
  name: c.name,
  kind: c.kind,
  vertical: c.vertical,
  categories: c.categories || [],
  location: {
    city: c.location?.city || '',
    state: c.location?.state || '',
  },
  moqMin: c.moqMin,
  priceBand: c.priceBand,
  trust: {
    tier: c.verification?.tier || 'listed',
    score: c.verification?.compositeScore || 0,
    caveats: c.verification?.caveats || [],
  },
  ratingAvg: c.ratingAvg,
  reviewCount: c.reviewCount || 0,
  claimed: !!c.owner,
});

/**
 * Generate (and persist) the ranked shortlist for a requirement.
 * @returns {Promise<Array>} top matches with profile summary + reasons
 */
const generateMatches = async (requirement, { limit = 10, poolSize = 50, explain = false } = {}) => {
  const filter = buildFilter(requirement);
  const searchStr = buildSearchString(requirement);
  const { candidates, hasText } = await fetchCandidates(filter, searchStr, poolSize);

  if (!candidates.length) return [];

  const maxText = hasText
    ? Math.max(...candidates.map((c) => c.score || 0), 0.0001)
    : 1;

  // Optional dense-vector blend (off unless EMBEDDINGS_ENABLED).
  const reqVec = embeddingService.isEnabled()
    ? await embeddingService.embed(
        [requirement.rawText, ...(requirement.parsed?.keywords || [])].join(' ')
      )
    : null;

  const scored = candidates.map((c) => {
    let semantic = hasText ? clamp01((c.score || 0) / maxText) : 0.4;
    if (reqVec && Array.isArray(c.embedding)) {
      semantic = clamp01(0.5 * semantic + 0.5 * embeddingService.cosine(reqVec, c.embedding));
    }
    const { fitScore, breakdown, reasons } = scoreCandidate(requirement, c, semantic);
    return { c, fitScore, breakdown, reasons };
  });

  scored.sort((a, b) => b.fitScore - a.fitScore);
  const top = scored.slice(0, limit);

  // Optional "why matched" for the top few. The single best match may escalate
  // to hosted Claude (Phase 2, if enabled + within budget); everything else
  // uses local Ollama, and both fall back to the template reasons.
  if (explain) {
    await Promise.all(
      top.slice(0, 3).map(async (t, i) => {
        let line = null;
        if (i === 0 && hostedAiService.isEnabled()) {
          line = await hostedAiService.callHosted(
            `In one sentence, explain why "${t.c.name}" (${t.c.vertical || 'business'} in ${t.c.location?.city || ''}) fits this buyer need. Be specific and factual; do not invent details.\nNeed: ${(requirement.rawText || '').slice(0, 300)}`,
            { maxTokens: 120 }
          );
        }
        if (!line) line = await aiService.explainMatch(requirement, t.c);
        if (line) {
          t.reasons = [line, ...t.reasons].slice(0, 4);
          t.reasonsBy = 'llm';
        }
      })
    );
  }

  // Persist Match docs (upsert per requirement+seller).
  if (top.length) {
    await Match.bulkWrite(
      top.map((t) => ({
        updateOne: {
          filter: { requirement: requirement._id, seller: t.c._id },
          update: {
            $set: {
              fitScore: t.fitScore,
              scoreBreakdown: t.breakdown,
              reasons: t.reasons,
              reasonsBy: t.reasonsBy || 'template',
              state: 'suggested',
            },
          },
          upsert: true,
        },
      }))
    );
  }

  return top.map((t) => ({
    profile: summarize(t.c),
    fitScore: Number(t.fitScore.toFixed(3)),
    scoreBreakdown: t.breakdown,
    reasons: t.reasons,
  }));
};

module.exports = { generateMatches };
