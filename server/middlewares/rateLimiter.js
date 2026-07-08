const rateLimit = require('express-rate-limit');

const jsonMessage = (message) => ({
  success: false,
  message,
});

/**
 * Global limiter: 500 requests / 15 minutes per IP.
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Too many requests. Please try again in a few minutes.'),
});

/**
 * Stricter limiter for auth routes: 10 requests / 15 minutes per IP.
 * Protects against brute-force login / OTP attempts.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage(
    'Too many authentication attempts. Please try again in 15 minutes.'
  ),
});

module.exports = { globalLimiter, authLimiter };
