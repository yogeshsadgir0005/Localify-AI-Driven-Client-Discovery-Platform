const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const addressSchema = new mongoose.Schema(
  {
    country: { type: String, default: 'IN' },
    state: { type: String, default: '' },
    district: { type: String, default: '' },
    city: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * A single recorded consent grant (DPDP Act 2023 groundwork). Each consent is
 * specific, timestamped and independently withdrawable. `purpose` names what
 * the user agreed to (e.g. 'terms', 'marketing_alerts', 'contact_reveal').
 */
const consentSchema = new mongoose.Schema(
  {
    purpose: { type: String, required: true },
    granted: { type: Boolean, default: true },
    version: { type: String, default: 'v1' },
    grantedAt: { type: Date, default: Date.now },
    withdrawnAt: { type: Date, default: null },
  },
  { _id: false }
);

/** A saved search / standing requirement the user can be alerted against later. */
const savedSearchSchema = new mongoose.Schema(
  {
    label: { type: String, default: '' },
    query: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
    },
    // Password is nullable: Google OAuth-only users have no password.
    password: {
      type: String,
      default: null,
      select: false,
    },
    googleId: {
      type: String,
      default: null,
    },
    avatar: {
      type: String,
      default: '',
    },
    address: {
      type: addressSchema,
      default: () => ({ state: '', district: '', city: '' }),
    },
    // --- Two-sided platform fields (additive; safe defaults so existing
    // documents remain valid without a destructive migration). ---
    // A user can be a buyer, a seller, or both. Everyone starts as a buyer.
    roles: {
      type: [String],
      enum: ['buyer', 'seller', 'admin'],
      default: ['buyer'],
    },
    phone: { type: String, default: null },
    phoneVerified: { type: Boolean, default: false },
    preferredLanguage: { type: String, default: 'en' },
    // DPDP consent ledger — see consentSchema above.
    consents: { type: [consentSchema], default: [] },
    // Standing searches for future match alerts.
    savedSearches: { type: [savedSearchSchema], default: [] },
    isActive: {
      type: Boolean,
      default: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    signupOTP: {
      type: String,
      default: null,
      select: false,
    },
    signupOTPExpiry: {
      type: Date,
      default: null,
      select: false,
    },
    // Hashed OTP for password reset. Never store the plain OTP.
    passwordResetOTP: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpiry: {
      type: Date,
      default: null,
      select: false,
    },
    passwordResetAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    passwordResetLockUntil: {
      type: Date,
      default: null,
      select: false,
    },
    plan: {
      type: String,
      enum: ['free', 'pro', 'max'],
      default: 'free',
    },
    subscriptionExpiry: {
      type: Date,
      default: null,
    },
    locationChanges: {
      count: { type: Number, default: 0 },
      resetAt: { type: Date, default: Date.now },
    },
    phoneUnhides: {
      unlockedPlaceIds: { type: [String], default: [] },
      resetAt: { type: Date, default: Date.now },
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

/**
 * Hash the password before save when it has been modified and is not null.
 */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password') || this.password == null) {
    return next();
  }
  try {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
    const salt = await bcrypt.genSalt(rounds);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (err) {
    return next(err);
  }
});

/**
 * Compare a candidate plaintext password against the stored hash.
 * Returns false safely if the user has no password (OAuth-only account).
 */
userSchema.methods.comparePassword = async function comparePassword(candidate) {
  if (!this.password || !candidate) return false;
  return bcrypt.compare(candidate, this.password);
};

/**
 * Sign and return a JWT containing a minimal identity payload.
 */
userSchema.methods.generateJWT = function generateJWT() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign(
    { id: this._id.toString(), email: this.email, name: this.name },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * Return a plain object safe to send to the client (no sensitive fields).
 */
userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    avatar: this.avatar || '',
    address: this.address || { country: 'IN', state: '', district: '', city: '' },
    plan: this.plan,
    subscriptionExpiry: this.subscriptionExpiry,
    locationChanges: this.locationChanges,
    phoneUnhides: this.phoneUnhides,
    roles: this.roles && this.roles.length ? this.roles : ['buyer'],
    phone: this.phone || null,
    phoneVerified: !!this.phoneVerified,
    preferredLanguage: this.preferredLanguage || 'en',
    isActive: this.isActive,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
