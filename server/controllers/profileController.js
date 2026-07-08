const crypto = require('crypto');
const BusinessProfile = require('../models/BusinessProfile');
const User = require('../models/User');
const TrustLabel = require('../models/TrustLabel');
const trustService = require('../services/trustService');
const ingestionService = require('../services/ingestionService');
const smsService = require('../services/smsService');
const gstService = require('../services/gstService');
const embeddingService = require('../services/embeddingService');
const { logEvent } = require('../utils/telemetry');

const REPORT_THRESHOLD = parseInt(process.env.REPORT_REVIEW_THRESHOLD, 10) || 2;

/** Text used to embed a profile for semantic matching. */
const embedText = (p) =>
  [p.name, p.description, (p.categories || []).join(' '), p.vertical, p.location?.city]
    .filter(Boolean)
    .join(' ');

/** Compute + store the profile embedding when enabled (no-op otherwise). */
const maybeEmbed = async (profile) => {
  const v = await embeddingService.embed(embedText(profile));
  if (v) profile.embedding = v;
};

const OTP_TTL_MS = 15 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const hashOTP = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
const generateOTP = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
const digits = (s) => String(s || '').replace(/\D/g, '');

/** Apply buyer-supplied structured fields to a profile (whitelisted). */
const applyProfileData = (profile, data = {}) => {
  const allowed = [
    'description',
    'vertical',
    'categories',
    'priceBand',
    'leadTimeDays',
    'attributes',
  ];
  for (const key of allowed) {
    if (data[key] !== undefined) profile[key] = data[key];
  }
  if (Number.isFinite(data.moqMin)) profile.moqMin = data.moqMin;
  if (Number.isFinite(data.moqMax)) profile.moqMax = data.moqMax;
  if (data.email) profile.contact.email = String(data.email).toLowerCase();
  if (data.whatsapp) profile.contact.whatsapp = digits(data.whatsapp);
  if (data.website) profile.contact.website = data.website;
  if (data.kind === 'freelancer') profile.kind = 'freelancer';
  if (Array.isArray(data.credentials)) profile.credentials = data.credentials;
  if (Array.isArray(data.portfolio)) profile.portfolio = data.portfolio;
};

/**
 * GET /api/profiles  [public]
 * Browse/search profiles. Contact details are never included here.
 */
const listProfiles = async (req, res, next) => {
  try {
    const { vertical, city, state, q, kind } = req.query;
    const filter = { status: { $in: ['seed', 'claimed', 'verified'] } };
    if (vertical) filter.vertical = vertical;
    if (kind) filter.kind = kind;
    if (city) filter['location.city'] = new RegExp(city, 'i');
    if (state) filter['location.state'] = new RegExp(`^${state}$`, 'i');

    let query;
    if (q) {
      query = BusinessProfile.find(
        { ...filter, $text: { $search: q } },
        { score: { $meta: 'textScore' } }
      ).sort({ score: { $meta: 'textScore' } });
    } else {
      query = BusinessProfile.find(filter).sort({ 'verification.compositeScore': -1 });
    }
    const profiles = await query.limit(50);
    return res.json({
      success: true,
      total: profiles.length,
      results: profiles.map((p) => p.toPublic()),
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/profiles/mine  [protected] */
const myProfiles = async (req, res, next) => {
  try {
    const profiles = await BusinessProfile.find({ owner: req.user.id }).sort({ updatedAt: -1 });
    return res.json({
      success: true,
      results: profiles.map((p) => p.toPublic({ includeContact: true })),
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/profiles/:id  [public] — owner sees contact; others do not. */
const getProfile = async (req, res, next) => {
  try {
    const profile = await BusinessProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Profile not found.' });
    }
    const isOwner = req.user && profile.owner && profile.owner.toString() === req.user.id;
    return res.json({ success: true, profile: profile.toPublic({ includeContact: isOwner }) });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/profiles  [protected]
 * Self-register a new (claimed) seller profile.
 */
const createProfile = async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      return res
        .status(422)
        .json({ success: false, message: 'A business/profile name is required.' });
    }
    const { city = '', district = '', state = '' } = req.body.location || {};
    const profile = new BusinessProfile({
      owner: req.user.id,
      source: 'self_registered',
      status: 'claimed',
      name: String(name).trim(),
      location: { city, district, state },
    });
    applyProfileData(profile, req.body);
    profile.rebuildIndexFields();
    trustService.recompute(profile);
    await maybeEmbed(profile);
    await profile.save();
    return res.status(201).json({
      success: true,
      profile: profile.toPublic({ includeContact: true }),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * PUT /api/profiles/:id  [protected] — owner edits their profile.
 */
const updateProfile = async (req, res, next) => {
  try {
    const profile = await BusinessProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Profile not found.' });
    }
    if (!profile.owner || profile.owner.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: 'You can only edit a profile you own.' });
    }
    applyProfileData(profile, req.body);
    if (req.body.name) profile.name = String(req.body.name).trim();
    if (req.body.location) {
      profile.location = { ...profile.location.toObject?.() ?? profile.location, ...req.body.location };
    }
    profile.rebuildIndexFields();
    trustService.recompute(profile);
    await maybeEmbed(profile);
    await profile.save();
    return res.json({ success: true, profile: profile.toPublic({ includeContact: true }) });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/profiles/:id/claim/request  [protected]
 * Body: { phone }. Emails the claimant a one-time code (the phone is self-
 * attested and must match the listed number, if any). Step 1 of the seed→claim
 * owner-merge. Falls back to a dev-console code when no email provider is set.
 */
const requestClaimOtp = async (req, res, next) => {
  try {
    const { phone } = req.body || {};
    if (!phone || digits(phone).length < 10) {
      return res
        .status(422)
        .json({ success: false, message: 'A valid phone number is required.' });
    }

    const profile = await BusinessProfile.findById(req.params.id).select(
      '+claimOtpHash +claimOtpExpiry +claimPhone +claimAttempts'
    );
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Profile not found.' });
    }
    if (profile.owner && profile.owner.toString() !== req.user.id) {
      return res
        .status(409)
        .json({ success: false, message: 'This profile has already been claimed.' });
    }
    // If the profile has a listed phone, the claimant must control that number.
    const listed = digits(profile.contact?.phone);
    if (listed && digits(phone) !== listed) {
      return res.status(422).json({
        success: false,
        message: 'The phone number must match the number listed for this business.',
      });
    }

    const otp = generateOTP();
    profile.claimPhone = digits(phone);
    profile.claimOtpHash = hashOTP(otp);
    profile.claimOtpExpiry = new Date(Date.now() + OTP_TTL_MS);
    profile.claimAttempts = 0;
    await profile.save();

    const delivery = await smsService.sendOtp(profile.claimPhone, otp, {
      context: 'claim',
      email: req.user.email,
    });

    return res.json({
      success: true,
      message: 'A verification code has been sent to your email.',
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/profiles/:id/claim/verify  [protected]
 * Body: { otp, profileData? }. Step 2: verifies the OTP and performs the
 * seed→User owner-merge (sets owner, flips status to claimed, records a
 * verified phone signal, and binds the phone to the user).
 */
const verifyClaim = async (req, res, next) => {
  try {
    const { otp, profileData } = req.body || {};
    if (!otp || !/^\d{6}$/.test(String(otp))) {
      return res
        .status(422)
        .json({ success: false, message: 'A valid 6-digit code is required.' });
    }

    const profile = await BusinessProfile.findById(req.params.id).select(
      '+claimOtpHash +claimOtpExpiry +claimPhone +claimAttempts'
    );
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Profile not found.' });
    }
    if (profile.owner && profile.owner.toString() !== req.user.id) {
      return res
        .status(409)
        .json({ success: false, message: 'This profile has already been claimed.' });
    }
    if (!profile.claimOtpHash || !profile.claimOtpExpiry) {
      return res
        .status(400)
        .json({ success: false, message: 'No claim in progress. Request a code first.' });
    }
    if (profile.claimOtpExpiry.getTime() < Date.now()) {
      profile.claimOtpHash = null;
      profile.claimOtpExpiry = null;
      await profile.save();
      return res.status(400).json({ success: false, message: 'Code expired. Request a new one.' });
    }
    if ((profile.claimAttempts || 0) >= MAX_OTP_ATTEMPTS) {
      return res
        .status(429)
        .json({ success: false, message: 'Too many attempts. Request a new code.' });
    }
    if (hashOTP(otp) !== profile.claimOtpHash) {
      profile.claimAttempts = (profile.claimAttempts || 0) + 1;
      await profile.save();
      return res.status(400).json({ success: false, message: 'Incorrect code.' });
    }

    // --- Owner-merge ---
    const claimedPhone = profile.claimPhone;
    profile.owner = req.user.id;
    profile.status = 'claimed';
    profile.source = profile.source === 'places_seed' ? 'places_seed' : 'self_registered';
    if (claimedPhone) profile.contact.phone = claimedPhone;
    trustService.addSignal(profile, {
      type: 'phone',
      verified: true,
      method: 'otp',
      raw: claimedPhone,
      verifiedAt: new Date(),
    });
    if (profileData) applyProfileData(profile, profileData);

    // Clear claim state.
    profile.claimOtpHash = null;
    profile.claimOtpExpiry = null;
    profile.claimPhone = null;
    profile.claimAttempts = 0;

    profile.rebuildIndexFields();
    trustService.recompute(profile);
    await maybeEmbed(profile);
    await profile.save();

    // Bind the phone to the user account.
    if (claimedPhone) {
      await User.findByIdAndUpdate(req.user.id, {
        phone: claimedPhone,
        phoneVerified: true,
        $addToSet: { roles: 'seller' },
      });
    } else {
      await User.findByIdAndUpdate(req.user.id, { $addToSet: { roles: 'seller' } });
    }

    logEvent(req, 'profile_claim', { target: profile._id.toString() });

    return res.json({
      success: true,
      message: 'Profile claimed and phone verified.',
      profile: profile.toPublic({ includeContact: true }),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/profiles/:id/verify  [protected]
 * Body: { type: 'gst'|'udyam'|'credential', value }. Records a verification
 * signal. GST/Udyam are self-attested (format-checked) pending the provider
 * spike — they raise trust modestly and carry an honest caveat.
 */
const submitVerification = async (req, res, next) => {
  try {
    const { type, value } = req.body || {};
    const profile = await BusinessProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Profile not found.' });
    }
    if (!profile.owner || profile.owner.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: 'You can only verify a profile you own.' });
    }

    if (type === 'gst') {
      const gst = await gstService.verifyGstin(value);
      if (gst.method === 'invalid') {
        return res
          .status(422)
          .json({ success: false, message: 'Enter a valid 15-character GSTIN.' });
      }
      // verified===true only when a GST provider is configured and confirms it.
      trustService.addSignal(profile, {
        type: 'gst',
        verified: gst.verified,
        method: gst.method,
        provider: gst.method === 'provider' ? 'gst_api' : null,
        raw: String(value).toUpperCase(),
        caveat: gst.caveat,
      });
    } else if (type === 'udyam') {
      trustService.addSignal(profile, {
        type: 'udyam',
        verified: false,
        method: 'self_attested',
        raw: value ? String(value) : null,
        caveat: 'Udyam is self-reported.',
      });
    } else if (type === 'credential') {
      trustService.addSignal(profile, {
        type: 'credential',
        verified: false,
        method: 'self_attested',
        raw: value ? String(value) : null,
        caveat: 'Professional credential self-attested.',
      });
    } else {
      return res
        .status(422)
        .json({ success: false, message: 'Unsupported verification type.' });
    }

    await profile.save();
    return res.json({
      success: true,
      trust: {
        tier: profile.verification.tier,
        score: profile.verification.compositeScore,
        caveats: profile.verification.caveats,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/profiles/:id/report  [protected]
 * Body: { reason }. A user reports a profile as suspicious. Records a
 * `user_report` TrustLabel (ground truth for the fraud model) and, past a
 * threshold, moves the profile to `under_review` (de-weighted in matching).
 */
const reportProfile = async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    const profile = await BusinessProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Profile not found.' });
    }
    if (profile.owner && profile.owner.toString() === req.user.id) {
      return res
        .status(400)
        .json({ success: false, message: 'You cannot report your own profile.' });
    }

    await TrustLabel.create({
      profile: profile._id,
      label: 'contested',
      source: 'user_report',
      reviewer: req.user.id,
      note: reason ? String(reason).slice(0, 500) : '',
    });

    profile.reportCount = (profile.reportCount || 0) + 1;
    if (profile.reportCount >= REPORT_THRESHOLD && profile.verification.reviewState === 'ok') {
      trustService.setReviewState(profile, 'under_review');
    } else {
      trustService.recompute(profile);
    }
    await profile.save();

    logEvent(req, 'report_profile', {
      target: profile._id.toString(),
      meta: { reportCount: profile.reportCount, reviewState: profile.verification.reviewState },
    });

    return res.json({
      success: true,
      message: 'Thanks — your report has been recorded and will be reviewed.',
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/profiles/ingest  [protected]
 * Body: { city, district, state, maxResults? }. Seeds unclaimed profiles from
 * Google Places. Billable — guarded by the Phase-0 spend circuit-breaker.
 */
const ingest = async (req, res, next) => {
  try {
    const { city, district, state, maxResults } = req.body || {};
    if (!city || !state) {
      return res
        .status(422)
        .json({ success: false, message: 'city and state are required.' });
    }
    const result = await ingestionService.seedFromPlaces(city, district || '', state, {
      maxResults: Math.min(parseInt(maxResults, 10) || 40, 120),
    });
    logEvent(req, 'profile_seed', { meta: { city, state, ...result } });
    return res.json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listProfiles,
  myProfiles,
  getProfile,
  createProfile,
  updateProfile,
  requestClaimOtp,
  verifyClaim,
  submitVerification,
  reportProfile,
  ingest,
};
