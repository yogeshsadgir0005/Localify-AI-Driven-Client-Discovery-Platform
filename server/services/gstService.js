const axios = require('axios');

/**
 * gstService — GSTIN verification. If a GST aggregator is configured (GST_API_URL
 * + GST_API_KEY) it performs a real active-filing check; otherwise it returns a
 * self-attested result (format already validated by the caller). This is the
 * config-only wire-up point for the Phase-0 provider spike.
 */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const isLive = () => !!(process.env.GST_API_URL && process.env.GST_API_KEY);

const isValidFormat = (gstin) => GSTIN_RE.test(String(gstin || '').toUpperCase());

/**
 * @returns {Promise<{verified:boolean, method:string, caveat:string|null, legalName?:string}>}
 */
const verifyGstin = async (gstin) => {
  const value = String(gstin || '').toUpperCase();
  if (!isValidFormat(value)) {
    return { verified: false, method: 'invalid', caveat: 'Not a valid GSTIN format.' };
  }
  if (!isLive()) {
    return {
      verified: false,
      method: 'self_attested',
      caveat: 'GSTIN self-reported; not yet independently verified.',
    };
  }
  try {
    const res = await axios.get(`${process.env.GST_API_URL}/${value}`, {
      headers: { 'x-api-key': process.env.GST_API_KEY },
      timeout: 10000,
    });
    // Provider-shape-agnostic: treat an ACTIVE status as verified.
    const status = (res.data?.status || res.data?.gstStatus || '').toString().toLowerCase();
    const active = status.includes('active');
    return {
      verified: active,
      method: 'provider',
      caveat: active ? null : 'GSTIN found but not marked active.',
      legalName: res.data?.legalName || res.data?.tradeName || undefined,
    };
  } catch (err) {
    console.error('[gst] verification failed:', err.response?.status || err.message);
    // Fail soft to self-attested rather than blocking the seller.
    return {
      verified: false,
      method: 'self_attested',
      caveat: 'GSTIN self-reported; verification service unavailable.',
    };
  }
};

module.exports = { isLive, isValidFormat, verifyGstin };
