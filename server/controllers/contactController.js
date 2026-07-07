const ContactRequest = require('../models/ContactRequest');
const BusinessProfile = require('../models/BusinessProfile');
const Requirement = require('../models/Requirement');
const Match = require('../models/Match');
const aiService = require('../services/aiService');
const notificationService = require('../services/notificationService');
const { publishPendingForContactRequest } = require('./reviewController');
const { logEvent } = require('../utils/telemetry');

/** Recompute a seller profile's responsiveness (accepted / received). */
const refreshResponsiveness = (profile) => {
  profile.stats = profile.stats || {};
  const received = profile.stats.requestsReceived || 0;
  profile.stats.responsivenessScore = received
    ? Math.min(1, (profile.stats.requestsAccepted || 0) / received)
    : 0;
};

// The single sentence that marks where the platform's job ends.
const HANDOFF_NOTE =
  'You are now connected. Continue on WhatsApp, phone, or email — LocalBiz does not handle quotes, payments, or delivery.';

/** Redact phone-like and email-like strings from a pre-reveal message. */
const redact = (text) =>
  String(text || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted]')
    .replace(/(?:\+?\d[\s-]?){7,}/g, '[redacted]')
    .slice(0, 1000);

/** Cheap intent score: a real need + a written message signals seriousness. */
const intentScore = (hasRequirement, message) =>
  Math.min(1, (hasRequirement ? 0.5 : 0) + Math.min((message || '').length / 200, 0.5));

/** Reveal the contact on a request (shared by seed auto-reveal and seller accept). */
const doReveal = async (cr, profile, buyerName, requirement) => {
  cr.status = 'revealed';
  cr.contactRevealedAt = new Date();
  cr.revealedContact = {
    phone: profile.contact?.phone || null,
    email: profile.contact?.email || null,
    whatsapp: profile.contact?.whatsapp || null,
    website: profile.contact?.website || null,
  };
  const draft = await aiService.draftIntro(buyerName, requirement, profile);
  cr.draftedMessage = draft.message;
  await cr.save();
};

/**
 * POST /api/contacts  [protected]
 * Body: { profileId, requirementId?, message? }
 * Buyer requests contact with a seller. Unclaimed seeds reveal immediately
 * (public info); claimed profiles require the seller's mutual opt-in.
 */
const createContactRequest = async (req, res, next) => {
  try {
    const { profileId, requirementId, message } = req.body || {};
    if (!profileId) {
      return res.status(422).json({ success: false, message: 'profileId is required.' });
    }

    const profile = await BusinessProfile.findById(profileId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Profile not found.' });
    }
    if (profile.owner && profile.owner.toString() === req.user.id) {
      return res
        .status(400)
        .json({ success: false, message: 'You cannot request contact with your own profile.' });
    }

    let requirement = null;
    if (requirementId) {
      requirement = await Requirement.findById(requirementId);
      if (requirement && requirement.buyer.toString() !== req.user.id) requirement = null;
    }

    // Idempotent: return an existing active request instead of duplicating.
    const existing = await ContactRequest.findOne({
      fromUser: req.user.id,
      toProfile: profile._id,
      status: { $in: ['pending', 'accepted', 'revealed'] },
    });
    if (existing) {
      return res.json({
        success: true,
        contactRequest: existing,
        handoffNote: existing.status === 'revealed' ? HANDOFF_NOTE : undefined,
        note: 'An active request for this profile already exists.',
      });
    }

    const cr = new ContactRequest({
      fromUser: req.user.id,
      toProfile: profile._id,
      toOwner: profile.owner || null,
      requirement: requirement?._id || null,
      requirementSnapshot: requirement
        ? { rawText: requirement.rawText, parsed: requirement.parsed }
        : null,
      intentScore: intentScore(!!requirement, message),
      message: redact(message),
      preRevealThreadOpened: !!message,
    });

    logEvent(req, 'contact_request', { target: profile._id.toString() });

    if (!profile.owner) {
      // Unclaimed seed → contact is public → reveal immediately.
      await doReveal(cr, profile, req.user.name, requirement);
      logEvent(req, 'contact_reveal', {
        target: profile._id.toString(),
        meta: { path: 'seed_public' },
      });
    } else {
      // Claimed → await the seller's mutual opt-in.
      await cr.save();
      profile.stats = profile.stats || {};
      profile.stats.requestsReceived = (profile.stats.requestsReceived || 0) + 1;
      refreshResponsiveness(profile);
      await profile.save();
      notificationService.notify(profile.owner, {
        type: 'contact_request',
        title: 'A buyer requested your contact',
        body: cr.requirementSnapshot?.rawText
          ? cr.requirementSnapshot.rawText.slice(0, 160)
          : 'Open your seller hub to respond.',
        data: { contactRequestId: cr._id.toString(), profileId: profile._id.toString() },
      });
    }

    // Mark the corresponding match as contacted.
    if (requirement) {
      await Match.updateOne(
        { requirement: requirement._id, seller: profile._id },
        { $set: { state: 'contacted' } }
      );
    }

    return res.status(201).json({
      success: true,
      contactRequest: cr,
      handoffNote: cr.status === 'revealed' ? HANDOFF_NOTE : undefined,
      message:
        cr.status === 'revealed'
          ? 'Contact revealed.'
          : 'Request sent. The business will be asked to share their contact.',
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/contacts  [protected] — the buyer's outgoing requests. */
const listMine = async (req, res, next) => {
  try {
    const requests = await ContactRequest.find({ fromUser: req.user.id })
      .sort({ createdAt: -1 })
      .populate('toProfile', 'name vertical location verification')
      .lean();
    return res.json({ success: true, requests });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/contacts/incoming  [protected] — the seller's incoming requests. */
const listIncoming = async (req, res, next) => {
  try {
    const requests = await ContactRequest.find({ toOwner: req.user.id })
      .sort({ createdAt: -1 })
      .populate('toProfile', 'name vertical location')
      .lean();
    // Hide the buyer's identity until the seller accepts (pre-reveal privacy).
    const safe = requests.map((r) => ({
      ...r,
      fromUser: r.status === 'revealed' ? r.fromUser : undefined,
    }));
    return res.json({ success: true, requests: safe });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/contacts/:id/respond  [protected]
 * Body: { accept: boolean }. The seller accepts (reveals) or declines.
 */
const respond = async (req, res, next) => {
  try {
    const { accept } = req.body || {};
    const cr = await ContactRequest.findById(req.params.id);
    if (!cr) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }
    if (!cr.toOwner || cr.toOwner.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: 'Only the business owner can respond.' });
    }
    if (cr.status !== 'pending') {
      return res
        .status(400)
        .json({ success: false, message: `Request is already ${cr.status}.` });
    }

    if (!accept) {
      cr.status = 'declined';
      await cr.save();
      return res.json({ success: true, message: 'Request declined.', contactRequest: cr });
    }

    const profile = await BusinessProfile.findById(cr.toProfile);
    const requirement = cr.requirement ? await Requirement.findById(cr.requirement) : null;
    const buyer = await require('../models/User').findById(cr.fromUser).select('name');
    await doReveal(cr, profile, buyer?.name, requirement);

    if (profile) {
      profile.stats = profile.stats || {};
      profile.stats.requestsAccepted = (profile.stats.requestsAccepted || 0) + 1;
      refreshResponsiveness(profile);
      await profile.save();
    }
    notificationService.notify(cr.fromUser, {
      type: 'contact_revealed',
      title: `${profile?.name || 'A business'} shared their contact`,
      body: 'Open “My connections” to view the details and reach out.',
      data: { contactRequestId: cr._id.toString() },
    });

    logEvent(req, 'contact_reveal', {
      target: cr.toProfile.toString(),
      meta: { path: 'seller_accept' },
    });

    return res.json({
      success: true,
      message: 'Contact shared with the buyer.',
      contactRequest: cr,
      handoffNote: HANDOFF_NOTE,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/contacts/:id/confirm-engagement  [protected]
 * Either party confirms they actually engaged (mechanical, not a quality
 * judgement). When both confirm, any pending review is published.
 */
const confirmEngagement = async (req, res, next) => {
  try {
    const cr = await ContactRequest.findById(req.params.id);
    if (!cr) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }
    const isBuyer = cr.fromUser.toString() === req.user.id;
    const isSeller = cr.toOwner && cr.toOwner.toString() === req.user.id;
    if (!isBuyer && !isSeller) {
      return res.status(403).json({ success: false, message: 'Not a participant.' });
    }
    if (cr.status !== 'revealed') {
      return res
        .status(400)
        .json({ success: false, message: 'Nothing to confirm until contact is revealed.' });
    }

    if (isBuyer) cr.engagementConfirmedByBuyer = true;
    if (isSeller) cr.engagementConfirmedBySeller = true;
    await cr.save();

    const both = cr.engagementConfirmedByBuyer && cr.engagementConfirmedBySeller;
    if (both) await publishPendingForContactRequest(cr._id);

    return res.json({
      success: true,
      bothConfirmed: both,
      contactRequest: cr,
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/contacts/:id  [protected] — participants only. */
const getOne = async (req, res, next) => {
  try {
    const cr = await ContactRequest.findById(req.params.id).populate(
      'toProfile',
      'name vertical location'
    );
    if (!cr) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }
    const isBuyer = cr.fromUser.toString() === req.user.id;
    const isSeller = cr.toOwner && cr.toOwner.toString() === req.user.id;
    if (!isBuyer && !isSeller) {
      return res.status(403).json({ success: false, message: 'Not a participant.' });
    }
    return res.json({
      success: true,
      contactRequest: cr,
      handoffNote: cr.status === 'revealed' ? HANDOFF_NOTE : undefined,
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  createContactRequest,
  listMine,
  listIncoming,
  respond,
  confirmEngagement,
  getOne,
};
