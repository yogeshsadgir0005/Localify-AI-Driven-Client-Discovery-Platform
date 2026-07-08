const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const emailService = require('../services/emailService');
const { logEvent } = require('../utils/telemetry');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
const OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_OTP_ATTEMPTS = 5;
const OTP_LOCK_MS = 15 * 60 * 1000;

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/** Hash an OTP for storage. */
const hashOTP = (otp) =>
  crypto.createHash('sha256').update(String(otp)).digest('hex');

/** Generate a 6-digit numeric OTP as a string. */
const generateOTP = () =>
  String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/**
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || name.trim().length < 2) {
      return res
        .status(422)
        .json({ success: false, message: 'Name must be at least 2 characters.' });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return res
        .status(422)
        .json({ success: false, message: 'A valid email is required.' });
    }
    if (!password || !PASSWORD_RE.test(password)) {
      return res.status(422).json({
        success: false,
        message:
          'Password must be at least 8 characters and include an uppercase letter and a number.',
      });
    }

    let user = await User.findOne({ email: email.toLowerCase() });
    if (user && user.emailVerified) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists. Try logging in.',
      });
    }

    if (!user) {
      user = new User({ email: email.toLowerCase() });
    }

    user.name = name.trim();
    user.password = password;
    user.emailVerified = false;

    const otp = generateOTP();
    user.signupOTP = hashOTP(otp);
    user.signupOTPExpiry = new Date(Date.now() + OTP_TTL_MS);

    await user.save();

    await emailService.sendOtpEmail(user.email, otp, { context: 'account verification' });

    console.log('[auth] Register successful, sent OTP for', user.email);
    return res.status(200).json({
      success: true,
      requiresOtp: true,
      message: 'A verification code has been sent to your email.',
    });
  } catch (err) {
    console.error('[auth] Register error:', err);
    return next(err);
  }
};

/**
 * POST /api/auth/verify-signup-otp
 */
const verifySignupOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body || {};

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(422).json({ success: false, message: 'A valid email is required.' });
    }
    if (!otp || !/^\d{6}$/.test(String(otp))) {
      return res.status(422).json({ success: false, message: 'A valid 6-digit code is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+signupOTP +signupOTPExpiry');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found. Please register again.' });
    }
    if (user.emailVerified) {
      return res.status(400).json({ success: false, message: 'Email is already verified. Please log in.' });
    }
    if (!user.signupOTP || !user.signupOTPExpiry || user.signupOTPExpiry.getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: 'Verification code expired. Please register again to get a new code.' });
    }

    if (hashOTP(otp) !== user.signupOTP) {
      return res.status(400).json({ success: false, message: 'Incorrect verification code.' });
    }

    user.emailVerified = true;
    user.signupOTP = null;
    user.signupOTPExpiry = null;
    user.lastLogin = new Date();
    await user.save();

    logEvent(req, 'register_verified', {
      actor: user._id.toString(),
      actorEmail: user.email,
    });

    const token = user.generateJWT();
    return res.status(200).json({
      success: true,
      token,
      user: user.toSafeObject(),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !EMAIL_RE.test(email)) {
      return res
        .status(422)
        .json({ success: false, message: 'A valid email is required.' });
    }
    if (!password) {
      return res
        .status(422)
        .json({ success: false, message: 'Password is required.' });
    }

    // Need the password field which is select:false by default.
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+password'
    );

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: 'No account found with this email.' });
    }

    // Only block if emailVerified is explicitly set to false (legacy accounts have undefined)
    // and they don't have a Google ID (Google accounts are implicitly verified).
    if (user.emailVerified === false && !user.googleId && user.password) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email address. Try signing up again to receive a new code.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'This account has been suspended. Please contact support.',
      });
    }

    if (!user.password) {
      return res.status(401).json({
        success: false,
        message:
          'This account was created with Google. Please continue with Google.',
      });
    }

    const ok = await user.comparePassword(password);
    if (!ok) {
      return res
        .status(401)
        .json({ success: false, message: 'Incorrect password.' });
    }

    user.lastLogin = new Date();
    await user.save();

    logEvent(req, 'login', {
      actor: user._id.toString(),
      actorEmail: user.email,
    });

    const token = user.generateJWT();
    return res.json({
      success: true,
      token,
      user: user.toSafeObject(),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/auth/google
 * Body: { credential } — the Google ID token from @react-oauth/google.
 */
const googleAuth = async (req, res, next) => {
  try {
    const { credential } = req.body || {};
    if (!credential) {
      return res
        .status(400)
        .json({ success: false, message: 'Google credential is required.' });
    }
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        success: false,
        message: 'Google sign-in is not configured on the server.',
      });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.error('[auth] Google token verification failed:', verifyErr.message);
      return res
        .status(401)
        .json({ success: false, message: 'Invalid Google credential.' });
    }

    if (!payload || !payload.email || !payload.email_verified) {
      return res.status(401).json({
        success: false,
        message: 'Google account email is not verified.',
      });
    }

    const email = payload.email.toLowerCase();
    let user = await User.findOne({ email });

    if (user) {
      // Link the Google account to an existing (possibly password) user.
      if (!user.googleId) user.googleId = payload.sub;
      if (!user.avatar && payload.picture) user.avatar = payload.picture;
      if (!user.emailVerified) user.emailVerified = true;
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'This account has been suspended. Please contact support.',
        });
      }
    } else {
      user = new User({
        name: payload.name || email.split('@')[0],
        email,
        googleId: payload.sub,
        avatar: payload.picture || '',
        password: null,
        emailVerified: true, // Google accounts are implicitly verified
      });
    }

    user.lastLogin = new Date();
    await user.save();

    logEvent(req, 'google_login', {
      actor: user._id.toString(),
      actorEmail: user.email,
    });

    const token = user.generateJWT();
    return res.json({
      success: true,
      token,
      user: user.toSafeObject(),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/auth/forgot-password
 * Always responds 200 with a generic message to avoid email enumeration,
 * but logs the OTP to the console in dev so it can be tested without email.
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) {
      return res
        .status(422)
        .json({ success: false, message: 'A valid email is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+passwordResetOTP +passwordResetExpiry +passwordResetAttempts +passwordResetLockUntil +password'
    );

    if (user) {
      const otp = generateOTP();
      user.passwordResetOTP = hashOTP(otp);
      user.passwordResetExpiry = new Date(Date.now() + OTP_TTL_MS);
      user.passwordResetAttempts = 0;
      user.passwordResetLockUntil = null;
      await user.save();

      // Send the OTP via email
      await emailService.sendOtpEmail(user.email, otp, { context: 'password reset' });
      console.log('[auth] Password reset OTP sent for', user.email);
    }

    return res.json({
      success: true,
      message:
        'If an account exists for this email, a reset code has been sent to it.',
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/auth/verify-reset-otp
 * Body: { email, otp }
 */
const verifyResetOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body || {};

    if (!email || !EMAIL_RE.test(email)) {
      return res
        .status(422)
        .json({ success: false, message: 'A valid email is required.' });
    }
    if (!otp || !/^\d{6}$/.test(String(otp))) {
      return res
        .status(422)
        .json({ success: false, message: 'A valid 6-digit code is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+passwordResetOTP +passwordResetExpiry +passwordResetAttempts +passwordResetLockUntil'
    );

    if (!user || !user.passwordResetOTP || !user.passwordResetExpiry) {
      return res.status(400).json({
        success: false,
        message: 'No reset request found. Please request a new code.',
      });
    }

    // Account temporarily locked after too many wrong attempts.
    if (
      user.passwordResetLockUntil &&
      user.passwordResetLockUntil.getTime() > Date.now()
    ) {
      return res.status(429).json({
        success: false,
        message: 'Too many incorrect attempts. Please try again in 15 minutes.',
      });
    }

    if (user.passwordResetExpiry.getTime() < Date.now()) {
      user.passwordResetOTP = null;
      user.passwordResetExpiry = null;
      user.passwordResetAttempts = 0;
      await user.save();
      return res.status(400).json({
        success: false,
        message: 'OTP expired. Please request a new code.',
      });
    }

    if (hashOTP(otp) !== user.passwordResetOTP) {
      user.passwordResetAttempts = (user.passwordResetAttempts || 0) + 1;
      if (user.passwordResetAttempts >= MAX_OTP_ATTEMPTS) {
        user.passwordResetLockUntil = new Date(Date.now() + OTP_LOCK_MS);
        user.passwordResetOTP = null;
        user.passwordResetExpiry = null;
        await user.save();
        return res.status(429).json({
          success: false,
          message:
            'Too many incorrect attempts. Reset is locked for 15 minutes.',
        });
      }
      await user.save();
      const remaining = MAX_OTP_ATTEMPTS - user.passwordResetAttempts;
      return res.status(400).json({
        success: false,
        message: `Incorrect code. ${remaining} attempt(s) remaining.`,
      });
    }

    return res.json({
      success: true,
      message: 'OTP verified successfully.',
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/auth/reset-password
 * Body: { email, otp, password }
 */
const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, password } = req.body || {};

    if (!email || !EMAIL_RE.test(email)) {
      return res
        .status(422)
        .json({ success: false, message: 'A valid email is required.' });
    }
    if (!otp || !/^\d{6}$/.test(String(otp))) {
      return res
        .status(422)
        .json({ success: false, message: 'A valid 6-digit code is required.' });
    }
    if (!password || !PASSWORD_RE.test(password)) {
      return res.status(422).json({
        success: false,
        message:
          'Password must be at least 8 characters and include an uppercase letter and a number.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+passwordResetOTP +passwordResetExpiry +passwordResetAttempts +passwordResetLockUntil +password'
    );

    if (!user || !user.passwordResetOTP || !user.passwordResetExpiry) {
      return res.status(400).json({
        success: false,
        message: 'No reset request found. Please request a new code.',
      });
    }

    // Account temporarily locked after too many wrong attempts.
    if (
      user.passwordResetLockUntil &&
      user.passwordResetLockUntil.getTime() > Date.now()
    ) {
      return res.status(429).json({
        success: false,
        message: 'Too many incorrect attempts. Please try again in 15 minutes.',
      });
    }

    if (user.passwordResetExpiry.getTime() < Date.now()) {
      user.passwordResetOTP = null;
      user.passwordResetExpiry = null;
      user.passwordResetAttempts = 0;
      await user.save();
      return res.status(400).json({
        success: false,
        message: 'OTP expired. Please request a new code.',
      });
    }

    if (hashOTP(otp) !== user.passwordResetOTP) {
      user.passwordResetAttempts = (user.passwordResetAttempts || 0) + 1;
      if (user.passwordResetAttempts >= MAX_OTP_ATTEMPTS) {
        user.passwordResetLockUntil = new Date(Date.now() + OTP_LOCK_MS);
        user.passwordResetOTP = null;
        user.passwordResetExpiry = null;
        await user.save();
        return res.status(429).json({
          success: false,
          message:
            'Too many incorrect attempts. Reset is locked for 15 minutes.',
        });
      }
      await user.save();
      const remaining = MAX_OTP_ATTEMPTS - user.passwordResetAttempts;
      return res.status(400).json({
        success: false,
        message: `Incorrect code. ${remaining} attempt(s) remaining.`,
      });
    }

    // Success: set the new password and clear reset state.
    user.password = password;
    user.passwordResetOTP = null;
    user.passwordResetExpiry = null;
    user.passwordResetAttempts = 0;
    user.passwordResetLockUntil = null;
    user.emailVerified = true; // Implicitly verified since they got the OTP
    await user.save();

    return res.json({
      success: true,
      message: 'Password reset successful. You can now log in.',
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * PUT /api/auth/update-address  [protected]
 */
const updateAddress = async (req, res, next) => {
  try {
    const { country, state, district, city } = req.body || {};

    if (!state || !district) {
      return res.status(422).json({
        success: false,
        message: 'Country, state and district are all required.',
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found.' });
    }

    const now = new Date();
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

    // Initialize tracking if missing
    if (!user.locationChanges || !user.locationChanges.resetAt) {
      user.locationChanges = { count: 0, resetAt: now };
    }

    // Reset counter if a week has passed
    if (now - user.locationChanges.resetAt > ONE_WEEK) {
      user.locationChanges.count = 0;
      user.locationChanges.resetAt = now;
    }

    // Check limits
    const plan = user.plan || 'free';
    let limit = 3;
    if (plan === 'pro') limit = 10;
    if (plan === 'max') limit = Infinity;

    if (user.locationChanges.count >= limit) {
      return res.status(403).json({
        success: false,
        message: `You have reached your limit of ${limit} location changes per week on the ${plan} plan.`,
        user: user.toSafeObject(),
      });
    }

    user.address = {
      country: (country || 'IN').trim(),
      state: state.trim(),
      district: district.trim(),
      city: (city || '').trim(),
    };
    user.locationChanges.count += 1;
    await user.save();

    logEvent(req, 'update_address', {
      meta: { country: user.address.country, state: user.address.state, district: user.address.district, count: user.locationChanges.count },
    });

    return res.json({
      success: true,
      message: 'Address updated.',
      user: user.toSafeObject(),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/auth/consent  [protected]
 * Returns the user's current consent ledger (DPDP transparency).
 */
const getConsents = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found.' });
    }
    return res.json({ success: true, consents: user.consents || [] });
  } catch (err) {
    return next(err);
  }
};

/**
 * PUT /api/auth/consent  [protected]
 * Body: { purpose, granted, version? }
 * Grants or withdraws consent for a specific purpose. Withdrawal must be as
 * easy as granting (DPDP Act 2023) — the same endpoint toggles either way.
 */
const updateConsent = async (req, res, next) => {
  try {
    const { purpose, granted, version } = req.body || {};

    if (!purpose || typeof purpose !== 'string' || !purpose.trim()) {
      return res
        .status(422)
        .json({ success: false, message: 'A consent purpose is required.' });
    }
    if (typeof granted !== 'boolean') {
      return res.status(422).json({
        success: false,
        message: 'The `granted` field must be true or false.',
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found.' });
    }

    const key = purpose.trim();
    const now = new Date();
    const existing = (user.consents || []).find((c) => c.purpose === key);

    if (existing) {
      existing.granted = granted;
      if (version) existing.version = version;
      if (granted) {
        existing.grantedAt = now;
        existing.withdrawnAt = null;
      } else {
        existing.withdrawnAt = now;
      }
    } else {
      user.consents.push({
        purpose: key,
        granted,
        version: version || 'v1',
        grantedAt: granted ? now : null,
        withdrawnAt: granted ? null : now,
      });
    }

    await user.save();

    logEvent(req, 'consent_update', { meta: { purpose: key, granted } });

    return res.json({
      success: true,
      message: granted ? 'Consent recorded.' : 'Consent withdrawn.',
      consents: user.consents,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/auth/saved-searches  [protected]
 */
const listSavedSearches = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('savedSearches');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    return res.json({ success: true, savedSearches: user.savedSearches || [] });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/auth/saved-searches  [protected]
 * Body: { label, query } — persists a search so the buyer can be alerted later.
 */
const addSavedSearch = async (req, res, next) => {
  try {
    const { label, query } = req.body || {};
    if (!query || typeof query !== 'object') {
      return res.status(422).json({ success: false, message: 'A search query is required.' });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if ((user.savedSearches || []).length >= 20) {
      return res.status(422).json({ success: false, message: 'You can save up to 20 searches.' });
    }
    user.savedSearches.push({ label: label ? String(label).slice(0, 80) : '', query });
    await user.save();
    return res.status(201).json({ success: true, savedSearches: user.savedSearches });
  } catch (err) {
    return next(err);
  }
};

/**
 * DELETE /api/auth/saved-searches/:id  [protected]
 */
const deleteSavedSearch = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    user.savedSearches = (user.savedSearches || []).filter((s) => s._id.toString() !== req.params.id);
    await user.save();
    return res.json({ success: true, savedSearches: user.savedSearches });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/auth/profile  [protected]
 */
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found.' });
    }
    if (!user.isActive) {
      return res
        .status(403)
        .json({ success: false, message: 'This account has been suspended.' });
    }
    return res.json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/auth/unhide-phone  [protected]
 */
const unhidePhone = async (req, res, next) => {
  try {
    const { placeId } = req.body;
    if (!placeId) {
      return res.status(400).json({ success: false, message: 'placeId is required.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Pro/Max users don't need this quota.
    if (user.plan !== 'free') {
      return res.json({ success: true });
    }

    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    const now = new Date();

    if (!user.phoneUnhides) {
      user.phoneUnhides = { unlockedPlaceIds: [], resetAt: now };
    }
    if (!user.phoneUnhides.unlockedPlaceIds) {
      user.phoneUnhides.unlockedPlaceIds = [];
    }

    // Reset weekly limit
    if (now - (user.phoneUnhides.resetAt || now) > ONE_WEEK) {
      user.phoneUnhides.unlockedPlaceIds = [];
      user.phoneUnhides.resetAt = now;
    }

    // If they already unlocked it this week, it's a free pass
    if (user.phoneUnhides.unlockedPlaceIds.includes(placeId)) {
      return res.json({ success: true, remaining: 3 - user.phoneUnhides.unlockedPlaceIds.length });
    }

    // Check limit (max 3)
    if (user.phoneUnhides.unlockedPlaceIds.length >= 3) {
      return res.status(403).json({
        success: false,
        message: 'You have reached your limit of 3 contact unhides for this week. Please upgrade to Pro.',
        requiresUpgrade: true
      });
    }

    user.phoneUnhides.unlockedPlaceIds.push(placeId);
    await User.updateOne(
      { _id: user._id },
      { $set: { phoneUnhides: user.phoneUnhides } }
    );

    return res.json({ 
      success: true, 
      remaining: 3 - user.phoneUnhides.unlockedPlaceIds.length 
    });
  } catch (err) {
    console.error('unhidePhone Error:', err);
    return res.status(500).json({ success: false, message: 'Internal error: ' + err.message, stack: err.stack });
  }
};

module.exports = {
  register,
  verifySignupOtp,
  login,
  googleAuth,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  updateAddress,
  getProfile,
  getConsents,
  updateConsent,
  listSavedSearches,
  addSavedSearch,
  deleteSavedSearch,
  unhidePhone,
};
