const mongoose = require('mongoose');

/**
 * Grievance — the intake record for DPDP data-principal requests and trust
 * decision appeals. This is the Phase-0 stub: it durably captures and
 * acknowledges a request with a ticket. The resolution workflow (human review
 * queue, SLA, correction/erasure actions) is built in later phases, but the
 * legal obligation to *receive* and track these exists from day one.
 */
const KINDS = [
  'dpdp_grievance', // general grievance to the grievance officer
  'data_access', // right to access personal data
  'data_correction', // right to correction
  'data_erasure', // right to erasure
  'trust_appeal', // appeal a trust/verification decision (forward-looking)
  'other',
];

const STATUSES = ['open', 'acknowledged', 'in_review', 'resolved', 'rejected'];

const grievanceSchema = new mongoose.Schema(
  {
    // Human-friendly reference returned to the submitter.
    ticket: { type: String, required: true, unique: true, index: true },
    kind: { type: String, required: true, enum: KINDS, index: true },
    status: { type: String, enum: STATUSES, default: 'open', index: true },
    // The data principal / appellant. Email is captured even for anonymous
    // (non-logged-in) submitters so we can respond.
    subjectEmail: { type: String, default: null },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // For trust appeals: what is being appealed (a profile, once those exist).
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    message: { type: String, required: true },
    evidenceUrls: { type: [String], default: [] },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

grievanceSchema.index({ createdAt: -1 });

grievanceSchema.statics.KINDS = KINDS;
grievanceSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('Grievance', grievanceSchema);
