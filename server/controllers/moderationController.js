const BusinessProfile = require('../models/BusinessProfile');
const TrustLabel = require('../models/TrustLabel');
const Grievance = require('../models/Grievance');
const trustService = require('../services/trustService');
const dedupeService = require('../services/dedupeService');
const hostedAiService = require('../services/hostedAiService');
const { logEvent } = require('../utils/telemetry');

/**
 * GET /api/moderation/queue  [admin]
 * Profiles that need a human look: under review, contested, flagged, or reported.
 */
const getQueue = async (req, res, next) => {
  try {
    const profiles = await BusinessProfile.find({
      $or: [
        { 'verification.reviewState': { $in: ['under_review', 'contested', 'flagged'] } },
        { reportCount: { $gt: 0 } },
      ],
    })
      .sort({ reportCount: -1, updatedAt: -1 })
      .limit(100)
      .lean();

    const appeals = await Grievance.find({
      kind: 'trust_appeal',
      status: { $in: ['open', 'acknowledged', 'in_review'] },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({
      success: true,
      total: profiles.length,
      queue: profiles.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        reviewState: p.verification?.reviewState || 'ok',
        fraudScore: p.verification?.fraudScore || 0,
        reportCount: p.reportCount || 0,
        trustScore: p.verification?.compositeScore || 0,
        claimed: !!p.owner,
      })),
      appeals: appeals.map((a) => ({
        ticket: a.ticket,
        targetId: a.targetId,
        message: a.message,
        status: a.status,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/moderation/appeal/:ticket/resolve  [admin]
 * Body: { decision: 'upheld'|'rejected', note? }
 * Resolves a trust appeal. `upheld` restores the appealed profile (clears
 * reports + review state) — the correction-rights loop DPDP requires.
 */
const resolveAppeal = async (req, res, next) => {
  try {
    const { decision, note } = req.body || {};
    if (!['upheld', 'rejected'].includes(decision)) {
      return res.status(422).json({ success: false, message: 'decision must be upheld or rejected.' });
    }
    const grievance = await Grievance.findOne({ ticket: req.params.ticket, kind: 'trust_appeal' });
    if (!grievance) {
      return res.status(404).json({ success: false, message: 'Appeal not found.' });
    }
    grievance.status = decision === 'upheld' ? 'resolved' : 'rejected';
    if (note) grievance.meta = { ...(grievance.meta || {}), resolution: String(note).slice(0, 500) };
    await grievance.save();

    if (decision === 'upheld' && grievance.targetId) {
      const profile = await BusinessProfile.findById(grievance.targetId).catch(() => null);
      if (profile) {
        profile.reportCount = 0;
        trustService.setReviewState(profile, 'ok');
        await profile.save();
      }
    }

    logEvent(req, 'moderation_action', {
      target: grievance.targetId || grievance.ticket,
      meta: { appeal: grievance.ticket, decision },
    });

    return res.json({ success: true, message: `Appeal ${decision}.`, ticket: grievance.ticket });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/moderation/:id/label  [admin]
 * Body: { label: 'fraud'|'legit'|'contested', note?, assist? }
 * Human review is the ground truth. `fraud` flags (excludes from matching);
 * `legit` clears reports and restores the profile; `contested` de-weights.
 * With { assist: true } (no label), returns a recommendation only — the hosted
 * escalation path for a low-confidence case — without changing state.
 */
const labelProfile = async (req, res, next) => {
  try {
    const { label, note, assist } = req.body || {};
    const profile = await BusinessProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Profile not found.' });
    }

    // Assist mode: recommendation only (public business-level data), no change.
    if (assist && !label) {
      const recommendation = await hostedAiService.callHosted(
        `A trust reviewer is deciding whether this business listing is fraudulent. Based only on the public signals, respond with one of: fraud, legit, contested — then a one-sentence reason.\nName: ${profile.name}\nVertical: ${profile.vertical || 'unknown'}\nReports: ${profile.reportCount || 0}\nVerified signals: ${(profile.verification?.signals || []).filter((s) => s.verified).map((s) => s.type).join(', ') || 'none'}\nReviews: ${profile.reviewCount || 0}`,
        { maxTokens: 120 }
      );
      return res.json({
        success: true,
        assist: true,
        recommendation: recommendation || 'Hosted escalation unavailable — decide from the signals shown.',
        hostedUsed: !!recommendation,
      });
    }

    if (!['fraud', 'legit', 'contested'].includes(label)) {
      return res.status(422).json({ success: false, message: 'label must be fraud, legit, or contested.' });
    }

    await TrustLabel.create({
      profile: profile._id,
      label,
      source: 'human_review',
      reviewer: req.user.id,
      note: note ? String(note).slice(0, 500) : '',
    });

    if (label === 'fraud') {
      trustService.setReviewState(profile, 'flagged');
    } else if (label === 'legit') {
      profile.reportCount = 0; // human cleared it
      trustService.setReviewState(profile, 'ok');
    } else {
      trustService.setReviewState(profile, 'contested');
    }
    await profile.save();

    logEvent(req, 'moderation_action', {
      target: profile._id.toString(),
      meta: { label, reviewState: profile.verification.reviewState },
    });

    return res.json({
      success: true,
      message: `Profile labelled ${label}.`,
      trust: {
        tier: profile.verification.tier,
        score: profile.verification.compositeScore,
        reviewState: profile.verification.reviewState,
        caveats: profile.verification.caveats,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/moderation/duplicates  [admin] */
const listDuplicates = async (req, res, next) => {
  try {
    const groups = await dedupeService.findDuplicates({});
    return res.json({ success: true, total: groups.length, groups });
  } catch (err) {
    return next(err);
  }
};

/** POST /api/moderation/merge  [admin] Body: { keepId, dropId } */
const mergeDuplicates = async (req, res, next) => {
  try {
    const { keepId, dropId } = req.body || {};
    if (!keepId || !dropId) {
      return res.status(422).json({ success: false, message: 'keepId and dropId are required.' });
    }
    const result = await dedupeService.mergeProfiles(keepId, dropId);
    logEvent(req, 'profile_merge', { target: keepId, meta: { dropId } });
    return res.json({ success: true, ...result });
  } catch (err) {
    if (/must (exist|differ)/.test(err.message)) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return next(err);
  }
};

/**
 * GET /api/moderation/metrics  [admin]
 * HONEST metric: precision/recall of the rules-based fraud score measured
 * against the real, human-labelled sample (fraud = positive). No synthetic
 * numbers — if there are no human labels yet, it says so.
 */
const metrics = async (req, res, next) => {
  try {
    const threshold = Number(req.query.threshold) || 0.4;
    const labels = await TrustLabel.find({
      source: 'human_review',
      label: { $in: ['fraud', 'legit'] },
    })
      .sort({ createdAt: -1 })
      .lean();

    // Latest human label per profile.
    const latest = new Map();
    for (const l of labels) if (!latest.has(l.profile.toString())) latest.set(l.profile.toString(), l.label);

    const ids = [...latest.keys()];
    if (!ids.length) {
      return res.json({
        success: true,
        sampleSize: 0,
        note: 'No human-labelled profiles yet. Precision/recall will populate as ops reviews accumulate. Synthetic-only metrics are intentionally not reported.',
      });
    }

    const profiles = await BusinessProfile.find({ _id: { $in: ids } })
      .select('verification.fraudScore')
      .lean();
    const scoreById = new Map(profiles.map((p) => [p._id.toString(), p.verification?.fraudScore || 0]));

    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;
    for (const [id, label] of latest) {
      const predFraud = (scoreById.get(id) || 0) >= threshold;
      const actualFraud = label === 'fraud';
      if (predFraud && actualFraud) tp += 1;
      else if (predFraud && !actualFraud) fp += 1;
      else if (!predFraud && actualFraud) fn += 1;
      else tn += 1;
    }
    const precision = tp + fp ? tp / (tp + fp) : null;
    const recall = tp + fn ? tp / (tp + fn) : null;

    return res.json({
      success: true,
      sampleSize: ids.length,
      threshold,
      confusion: { tp, fp, fn, tn },
      precision,
      recall,
      note: 'Measured on the real human-labelled sample (fraud = positive). Not a synthetic benchmark.',
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { getQueue, labelProfile, listDuplicates, mergeDuplicates, metrics, resolveAppeal };
