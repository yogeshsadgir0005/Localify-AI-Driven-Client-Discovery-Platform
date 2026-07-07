/**
 * trustService — computes an earned, evidence-based, symmetric trust score and
 * tier from a profile's verification signals and its contact-verified reviews.
 * Trust is never sold (no pay-to-rank). Every raised tier is backed by a signal
 * and every soft signal carries a caveat.
 */

// Tier ranking (higher wins). A tier is only reached by a *verified* signal.
const TIER_RANK = {
  listed: 0,
  phone_verified: 1,
  email_verified: 2,
  gst_verified: 3,
  kyb_verified: 4,
};

// Points per signal toward the 0..100 composite score.
const POINTS = {
  phone: 20,
  email: 10,
  gst_verified: 30,
  gst_self: 5, // GSTIN self-attested but not independently verified
  udyam: 10, // self-reported
  credential: 15,
  kyb: 20,
};

/**
 * Rules-based fraud score (0..1, higher = riskier). A cheap, explainable
 * baseline; Phase-2 escalation can route uncertain cases to a classifier or
 * hosted review. Factors: user reports, and "many reviews but no verification"
 * (a classic farming pattern).
 */
const computeFraudScore = (profile) => {
  let risk = 0;
  const reports = profile.reportCount || 0;
  risk += Math.min(reports * 0.15, 0.6);

  const verified = (profile.verification?.signals || []).some((s) => s.verified);
  if (!verified && (profile.reviewCount || 0) >= 5) risk += 0.25;

  return Math.max(0, Math.min(1, Number(risk.toFixed(2))));
};

/**
 * Recompute `profile.verification.{tier,compositeScore,caveats,fraudScore}` in
 * place from its signals, reviews, moderation state, and abuse signals.
 * Does NOT save — the caller persists.
 */
const recompute = (profile) => {
  const signals = profile.verification?.signals || [];
  let score = 0;
  let tier = 'listed';
  const caveats = [];

  const raiseTier = (t) => {
    if (TIER_RANK[t] > TIER_RANK[tier]) tier = t;
  };

  for (const s of signals) {
    switch (s.type) {
      case 'phone':
        if (s.verified) {
          score += POINTS.phone;
          raiseTier('phone_verified');
        }
        break;
      case 'email':
        if (s.verified) {
          score += POINTS.email;
          raiseTier('email_verified');
        }
        break;
      case 'gst':
        if (s.verified) {
          score += POINTS.gst_verified;
          raiseTier('gst_verified');
        } else {
          score += POINTS.gst_self;
          caveats.push(
            s.caveat || 'GSTIN is self-reported and not yet independently verified.'
          );
        }
        break;
      case 'udyam':
        score += POINTS.udyam;
        caveats.push(s.caveat || 'Udyam is self-reported.');
        break;
      case 'credential':
        score += POINTS.credential;
        if (!s.verified) {
          caveats.push(
            s.caveat || 'Professional credential is self-attested.'
          );
        }
        break;
      case 'kyb':
        if (s.verified) {
          score += POINTS.kyb;
          raiseTier('kyb_verified');
        }
        break;
      default:
        break;
    }
  }

  // Review contribution (contact-verified reviews only).
  const reviewCount = profile.reviewCount || 0;
  score += Math.min(reviewCount * 2, 20);
  if (profile.ratingAvg != null && reviewCount >= 3) {
    score += Math.round((profile.ratingAvg - 3) * 2); // -4..+4
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  profile.verification = profile.verification || {};
  const reviewState = profile.verification.reviewState || 'ok';
  const fraudScore = computeFraudScore(profile);

  // Moderation adjustments — trust is symmetric and evidence-based, so a
  // flagged/contested profile is de-weighted (or zeroed), never silently kept.
  if (reviewState === 'flagged') {
    score = 0;
    tier = 'listed';
    caveats.push('Flagged for review — excluded from matching until resolved.');
  } else if (reviewState === 'under_review' || reviewState === 'contested') {
    score = Math.round(score * 0.5);
    caveats.push('Under review — trust temporarily reduced.');
  }
  // Fraud risk always shaves the score (independent of explicit review state).
  if (fraudScore > 0) score = Math.round(score * (1 - fraudScore * 0.5));

  profile.verification.tier = tier;
  profile.verification.compositeScore = Math.max(0, Math.min(100, score));
  profile.verification.caveats = Array.from(new Set(caveats));
  profile.verification.fraudScore = fraudScore;
  return profile;
};

/**
 * Set the moderation review state, then recompute. Does NOT save.
 */
const setReviewState = (profile, reviewState) => {
  profile.verification = profile.verification || {};
  profile.verification.reviewState = reviewState;
  return recompute(profile);
};

/**
 * Add or replace a verification signal of a given type, then recompute.
 * Does NOT save — the caller persists.
 */
const addSignal = (profile, signal) => {
  profile.verification = profile.verification || { signals: [] };
  const signals = profile.verification.signals || [];
  const filtered = signals.filter((s) => s.type !== signal.type);
  filtered.push({
    verified: false,
    method: null,
    provider: null,
    raw: null,
    caveat: null,
    verifiedAt: signal.verified ? new Date() : null,
    ...signal,
  });
  profile.verification.signals = filtered;
  return recompute(profile);
};

module.exports = { recompute, addSignal, setReviewState, computeFraudScore, TIER_RANK };
