const crypto = require('crypto');
const Grievance = require('../models/Grievance');
const { logEvent } = require('../utils/telemetry');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** DPDP-visible request kinds a data principal may submit via the public form. */
const PUBLIC_KINDS = [
  'dpdp_grievance',
  'data_access',
  'data_correction',
  'data_erasure',
  'other',
];

/** A short, unprefixed ticket id, e.g. "GRV-1A2B3C4D". */
const makeTicket = (prefix) =>
  `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const grievanceOfficer = () => ({
  name: process.env.GRIEVANCE_OFFICER_NAME || 'Grievance Officer',
  email: process.env.GRIEVANCE_OFFICER_EMAIL || 'privacy@localbiz.example',
});

/**
 * GET /api/legal/privacy  [public]
 * A machine-readable privacy notice + the named grievance officer, so the
 * client can render an always-current policy page. The canonical prose lives
 * in PRIVACY.md at the repo root.
 */
const getPrivacyNotice = (req, res) => {
  return res.json({
    success: true,
    lastUpdated: '2026-07-02',
    controller: 'LocalBiz',
    summary:
      'We help you discover local businesses and their public contact details. Contact reveal and outreach are opt-in. We never sell your data.',
    dataWeProcess: [
      'Account data you provide (name, email, phone, preferred language).',
      'Your address (state/district/city) to scope searches.',
      'Public business information sourced from Google Places (place_id retained; other content is cached only temporarily).',
      'Behavioural events (searches, views) to improve matching and detect abuse.',
      'Consent records and any grievance/appeal you submit.',
    ],
    yourRights: [
      'Access the personal data we hold about you.',
      'Correct inaccurate data.',
      'Withdraw consent as easily as you gave it.',
      'Request erasure of your data.',
      'Raise a grievance with our Grievance Officer.',
    ],
    howToExercise:
      'Submit a request at POST /api/legal/grievance or contact the Grievance Officer below.',
    grievanceOfficer: grievanceOfficer(),
    note: 'This is Phase-0 groundwork ahead of full DPDP Act 2023 compliance. Legal review pending (see docs/PHASE0_PROVIDER_SPIKE.md).',
  });
};

/**
 * GET /api/legal/terms  [public]
 * Machine-readable summary of the Terms of Service. Canonical prose in TERMS.md.
 */
const getTerms = (req, res) => {
  return res.json({
    success: true,
    lastUpdated: '2026-07-02',
    summary:
      'LocalBiz is a discovery and connection layer. It does NOT process payments, hold funds, provide escrow, or take part in any deal — everything after the contact is revealed happens off-platform, between you and the other party, at your own risk.',
    keyPoints: [
      'No transactions: LocalBiz never handles money, quotes, or delivery.',
      'Verification badges indicate a signal, not a guarantee of honesty or outcome.',
      'Reviews are contact-verified — a reported experience, not a LocalBiz endorsement.',
      'No spam: revealed contacts must not be used for unsolicited bulk marketing (TRAI/DND).',
      'Do not claim businesses you do not control, farm reviews, or scrape data.',
      'Service is provided "as is"; LocalBiz is not liable for dealings between users.',
      'Governed by the laws of India.',
    ],
    privacy: 'See GET /api/legal/privacy for data practices and your DPDP rights.',
    note: 'Draft pending legal review. Canonical text: TERMS.md.',
  });
};

/**
 * POST /api/legal/grievance  [public, rate-limited]
 * Body: { kind, email, message }
 * Intake for DPDP data-principal requests / grievances.
 */
const submitGrievance = async (req, res, next) => {
  try {
    const { kind, email, message } = req.body || {};

    const chosenKind = PUBLIC_KINDS.includes(kind) ? kind : 'dpdp_grievance';

    // Use the authenticated email if present, else require one in the body.
    const subjectEmail = (req.user?.email || email || '').toLowerCase();
    if (!subjectEmail || !EMAIL_RE.test(subjectEmail)) {
      return res.status(422).json({
        success: false,
        message: 'A valid email is required so we can respond to your request.',
      });
    }
    if (!message || String(message).trim().length < 10) {
      return res.status(422).json({
        success: false,
        message: 'Please describe your request in at least 10 characters.',
      });
    }

    const grievance = await Grievance.create({
      ticket: makeTicket('GRV'),
      kind: chosenKind,
      subjectEmail,
      user: req.user?.id || null,
      message: String(message).trim(),
    });

    logEvent(req, 'grievance_submitted', {
      target: grievance.ticket,
      meta: { kind: chosenKind },
    });

    return res.status(201).json({
      success: true,
      message:
        'Your request has been recorded. Our Grievance Officer will respond by email.',
      ticket: grievance.ticket,
      grievanceOfficer: grievanceOfficer(),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/legal/appeal  [protected]
 * Body: { targetType, targetId, reason, evidenceUrls? }
 * Stub for appealing a trust/verification decision. Forward-looking: business
 * profiles do not exist yet, so the target is accepted as free-form.
 */
const submitAppeal = async (req, res, next) => {
  try {
    const { targetType, targetId, reason, evidenceUrls } = req.body || {};

    if (!reason || String(reason).trim().length < 10) {
      return res.status(422).json({
        success: false,
        message: 'Please explain the basis for your appeal (at least 10 characters).',
      });
    }

    const grievance = await Grievance.create({
      ticket: makeTicket('APL'),
      kind: 'trust_appeal',
      subjectEmail: req.user?.email || null,
      user: req.user?.id || null,
      targetType: targetType || null,
      targetId: targetId || null,
      message: String(reason).trim(),
      evidenceUrls: Array.isArray(evidenceUrls)
        ? evidenceUrls.filter((u) => typeof u === 'string').slice(0, 10)
        : [],
    });

    logEvent(req, 'trust_appeal', {
      target: grievance.ticket,
      meta: { targetType: targetType || null, targetId: targetId || null },
    });

    return res.status(201).json({
      success: true,
      message:
        'Your appeal has been recorded and will be reviewed. Contested items are de-weighted until resolved.',
      ticket: grievance.ticket,
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { getPrivacyNotice, getTerms, submitGrievance, submitAppeal };
