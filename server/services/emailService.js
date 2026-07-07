const axios = require('axios');

/**
 * emailService — transactional email via Brevo's free tier (300 emails/day, no
 * domain required — just a verified sender). Used for OTP delivery and, later,
 * notification emails. If BREVO_API_KEY is unset it falls back to DEV mode
 * (logs to the console) so the flow keeps working with no provider.
 *
 * Config:
 *   BREVO_API_KEY    free key from https://app.brevo.com (SMTP & API → API Keys)
 *   EMAIL_FROM       a sender address VERIFIED in Brevo (e.g. you@gmail.com)
 *   EMAIL_FROM_NAME  display name, default 'Setu'
 */
const isLive = () => !!process.env.BREVO_API_KEY;

const fromName = () => process.env.EMAIL_FROM_NAME || 'Setu';

/**
 * Send one transactional email. Never throws — returns { sent, dev }.
 * @param {{to:string, subject:string, html?:string, text?:string}} msg
 */
const sendEmail = async ({ to, subject, html, text }) => {
  if (!isLive()) {
    console.log(`\n[email:dev] to=${to} | ${subject}\n${text || html || ''}\n`);
    return { sent: true, dev: true };
  }
  try {
    await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { email: process.env.EMAIL_FROM, name: fromName() },
        to: [{ email: to }],
        subject,
        htmlContent: html || `<p>${text || ''}</p>`,
        ...(text ? { textContent: text } : {}),
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        timeout: 10000,
      }
    );
    return { sent: true, dev: false };
  } catch (err) {
    console.error('[email] send failed:', err.response?.status || err.message);
    return { sent: false, dev: false };
  }
};

/**
 * Deliver a one-time code by email.
 * @returns {Promise<{sent:boolean, dev:boolean}>}
 */
const sendOtpEmail = async (to, otp, { context = 'verification' } = {}) => {
  const subject = `Your ${fromName()} ${context} code: ${otp}`;
  const text =
    `Your ${context} code is ${otp}.\n` +
    `It is valid for a few minutes. If you didn't request this, you can ignore this email.`;
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111">` +
    `<p>Your ${context} code is:</p>` +
    `<p style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p>` +
    `<p style="color:#666">Valid for a few minutes. If you didn't request this, ignore this email.</p>` +
    `</div>`;
  return sendEmail({ to, subject, html, text });
};

module.exports = { isLive, sendEmail, sendOtpEmail };
