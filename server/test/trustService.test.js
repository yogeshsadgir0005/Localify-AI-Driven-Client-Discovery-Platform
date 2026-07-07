const { test } = require('node:test');
const assert = require('node:assert/strict');
const trust = require('../services/trustService');

const base = () => ({ verification: { signals: [] }, reviewCount: 0, ratingAvg: null, reportCount: 0 });

test('listed by default', () => {
  const p = trust.recompute(base());
  assert.equal(p.verification.tier, 'listed');
  assert.equal(p.verification.compositeScore, 0);
});

test('verified phone raises tier + score', () => {
  const p = base();
  trust.addSignal(p, { type: 'phone', verified: true, method: 'otp' });
  assert.equal(p.verification.tier, 'phone_verified');
  assert.ok(p.verification.compositeScore >= 20);
});

test('verified GST reaches gst_verified', () => {
  const p = base();
  trust.addSignal(p, { type: 'phone', verified: true });
  trust.addSignal(p, { type: 'gst', verified: true });
  assert.equal(p.verification.tier, 'gst_verified');
});

test('self-attested GST adds a caveat, not the tier', () => {
  const p = base();
  trust.addSignal(p, { type: 'gst', verified: false, method: 'self_attested', caveat: 'x' });
  assert.notEqual(p.verification.tier, 'gst_verified');
  assert.ok(p.verification.caveats.length >= 1);
});

test('flagged zeroes the score', () => {
  const p = base();
  trust.addSignal(p, { type: 'phone', verified: true });
  trust.setReviewState(p, 'flagged');
  assert.equal(p.verification.compositeScore, 0);
});

test('fraud score rises with reports', () => {
  const p = base();
  p.reportCount = 2;
  assert.equal(trust.computeFraudScore(p), 0.3);
});

test('addSignal replaces same-type signal', () => {
  const p = base();
  trust.addSignal(p, { type: 'gst', verified: false });
  trust.addSignal(p, { type: 'gst', verified: true });
  assert.equal(p.verification.signals.filter((s) => s.type === 'gst').length, 1);
});
