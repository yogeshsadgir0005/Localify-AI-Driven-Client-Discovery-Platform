const emailService = require('./emailService');

/**
 * smsService — OTP delivery dispatcher.
 *
 * The free/open-source stack has NO SMS provider: reliable transactional SMS in
 * India requires paid DLT-registered routes. So verification codes are delivered
 * by EMAIL (see emailService / Brevo) and the phone number is treated as
 * self-attested (same posture as GSTIN). The module keeps its name + signature
 * so callers are unchanged; pass the recipient's `email` in the options.
 *
 * If no email is available (or no provider is configured) it falls back to
 * DEV mode: the code is logged to the server console and the caller may echo
 * `devOtp` in non-production.
 */
// No email available (and we don't use SMS here), so fail.

/**
 * Deliver a one-time code. Never throws — returns { sent, dev, channel } so the
 * caller can proceed even if delivery fails.
 * @param {string} recipient  phone/label for logging (self-attested)
 * @param {string} otp
 * @param {{context?:string, email?:string}} opts  `email` = where to send the code
 * @returns {Promise<{sent:boolean, dev:boolean, channel:string}>}
 */
const sendOtp = async (recipient, otp, { context = 'verification', email } = {}) => {
  if (email) {
    const r = await emailService.sendOtpEmail(email, otp, { context });
    return { sent: r.sent, channel: 'email' };
  }
  // No email on file — delivery fails.
  return { sent: false, channel: 'none', error: 'No email provided for OTP' };
};

module.exports = { sendOtp };
