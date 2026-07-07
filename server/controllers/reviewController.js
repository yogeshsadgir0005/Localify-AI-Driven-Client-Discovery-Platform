const Review = require('../models/Review');
const ContactRequest = require('../models/ContactRequest');
const BusinessProfile = require('../models/BusinessProfile');
const TrustLabel = require('../models/TrustLabel');
const trustService = require('../services/trustService');
const { logEvent } = require('../utils/telemetry');

const REVIEW_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const REVIEW_RATE_MAX = 10;
const AUTHENTICITY_MIN = 0.5;

/**
 * Anti-farming authenticity score (0..1). Detects reciprocal review rings:
 * if the profile's owner has themselves connected with a profile the reviewer
 * owns, the two accounts are cross-linked and the review is down-weighted.
 */
const computeAuthenticity = async (reviewerId, profile) => {
  if (!profile.owner) return 1;
  const reviewerProfiles = await BusinessProfile.find({ owner: reviewerId }).select('_id').lean();
  if (!reviewerProfiles.length) return 1;
  const reciprocal = await ContactRequest.exists({
    fromUser: profile.owner,
    status: 'revealed',
    toProfile: { $in: reviewerProfiles.map((p) => p._id) },
  });
  return reciprocal ? 0.3 : 1;
};

/** Record a confirmed-legit label (training ground truth) when a review publishes. */
const markLegit = async (profileId) => {
  try {
    await TrustLabel.create({ profile: profileId, label: 'legit', source: 'confirmed_outcome' });
  } catch (err) {
    console.error('[review] markLegit failed:', err.message);
  }
};

/**
 * Recompute a profile's rating aggregates from its PUBLISHED reviews, then
 * refresh its trust score (reviews contribute to trust).
 */
const recomputeProfileRating = async (profileId) => {
  const published = await Review.find({ profile: profileId, status: 'published' }).lean();
  const count = published.length;
  const avg = count
    ? published.reduce((s, r) => s + (r.rating || 0), 0) / count
    : null;

  const profile = await BusinessProfile.findById(profileId);
  if (!profile) return;
  profile.reviewCount = count;
  profile.ratingAvg = avg != null ? Math.round(avg * 10) / 10 : null;
  trustService.recompute(profile);
  await profile.save();
};

/**
 * Publish any pending review tied to a contact request once BOTH parties have
 * confirmed engagement. Called from the engagement-confirmation flow.
 */
const publishPendingForContactRequest = async (contactRequestId) => {
  const review = await Review.findOne({
    contactRequest: contactRequestId,
    status: 'pending_confirmation',
  });
  if (!review) return;
  review.bothPartiesConfirmedEngagement = true;
  review.status = 'published';
  await review.save();
  await recomputeProfileRating(review.profile);
  await markLegit(review.profile);
};

/**
 * POST /api/reviews  [protected]
 * Body: { contactRequestId, rating, aspects?, text? }
 * A review is CONTACT-VERIFIED: it must be tied to a revealed connection, and
 * is only published once both parties confirm they engaged.
 */
const createReview = async (req, res, next) => {
  try {
    const { contactRequestId, rating, aspects, text } = req.body || {};
    const r = Number(rating);
    if (!contactRequestId) {
      return res.status(422).json({ success: false, message: 'contactRequestId is required.' });
    }
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      return res.status(422).json({ success: false, message: 'Rating must be 1–5.' });
    }

    const cr = await ContactRequest.findById(contactRequestId);
    if (!cr) {
      return res.status(404).json({ success: false, message: 'Connection not found.' });
    }
    // Only the buyer who was connected may review, and only after reveal.
    if (cr.fromUser.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: 'You can only review a connection you made.' });
    }
    if (cr.status !== 'revealed') {
      return res.status(400).json({
        success: false,
        message: 'You can only review after the contact has been revealed.',
      });
    }

    // Anti-farming: no self-review, one review per connection, rate limit.
    const profile = await BusinessProfile.findById(cr.toProfile);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Profile not found.' });
    }
    if (profile.owner && profile.owner.toString() === req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: 'You cannot review your own profile.' });
    }
    const existing = await Review.findOne({ contactRequest: cr._id });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: 'You have already reviewed this connection.' });
    }
    const recent = await Review.countDocuments({
      reviewer: req.user.id,
      createdAt: { $gt: new Date(Date.now() - REVIEW_RATE_WINDOW_MS) },
    });
    if (recent >= REVIEW_RATE_MAX) {
      return res
        .status(429)
        .json({ success: false, message: 'Too many reviews recently. Please slow down.' });
    }

    const bothConfirmed =
      cr.engagementConfirmedByBuyer && cr.engagementConfirmedBySeller;

    const cleanAspects = {};
    if (aspects && typeof aspects === 'object') {
      for (const key of ['quality', 'value', 'service', 'reliability']) {
        const v = Number(aspects[key]);
        if (Number.isFinite(v) && v >= 1 && v <= 5) cleanAspects[key] = v;
      }
    }

    // Anti-farming: suspicious reviews are held ('flagged') and never counted.
    const authenticityScore = await computeAuthenticity(req.user.id, profile);
    const suspicious = authenticityScore < AUTHENTICITY_MIN;
    const status = suspicious
      ? 'flagged'
      : bothConfirmed
        ? 'published'
        : 'pending_confirmation';

    const review = await Review.create({
      contactRequest: cr._id,
      reviewer: req.user.id,
      profile: profile._id,
      rating: r,
      aspects: cleanAspects,
      text: text ? String(text).slice(0, 2000) : '',
      bothPartiesConfirmedEngagement: bothConfirmed,
      authenticityScore,
      status,
    });

    if (status === 'published') {
      await recomputeProfileRating(profile._id);
      await markLegit(profile._id);
    }

    logEvent(req, 'review_create', {
      target: profile._id.toString(),
      meta: { rating: r, status, authenticityScore },
    });

    return res.status(201).json({
      success: true,
      message:
        status === 'published'
          ? 'Review published.'
          : status === 'flagged'
            ? 'Review received and held for anti-abuse review.'
            : 'Review saved — it publishes once both parties confirm they engaged.',
      review: {
        id: review._id.toString(),
        status: review.status,
        rating: review.rating,
        authenticityScore,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/reviews/profile/:profileId  [public] — published reviews. */
const listForProfile = async (req, res, next) => {
  try {
    const reviews = await Review.find({
      profile: req.params.profileId,
      status: 'published',
    })
      .sort({ createdAt: -1 })
      .select('rating aspects text createdAt authenticityScore')
      .lean();
    return res.json({ success: true, total: reviews.length, reviews });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  createReview,
  listForProfile,
  publishPendingForContactRequest,
  recomputeProfileRating,
};
