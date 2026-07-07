const axios = require('axios');
const ApiUsage = require('../models/ApiUsage');

/**
 * hostedAiService — the Phase-2 hosted-Claude escalation path for the
 * reasoning-heavy tail (edge-case fraud review, low-confidence dedupe, richer
 * "why matched"). It is:
 *   - feature-flagged (HOSTED_LLM_ENABLED must be 'true'),
 *   - key-gated (needs ANTHROPIC_API_KEY),
 *   - budget-capped (HOSTED_LLM_DAILY_CAP calls/UTC-day; 0 = unlimited),
 * and it NEVER becomes a hard dependency: if disabled, unconfigured, or over
 * budget, callHosted() returns null and callers fall back to local Ollama/rules.
 *
 * It is only ever handed PUBLIC, business-level data — never a buyer's private
 * contact or a consent record — keeping it clear of DPDP-sensitive data.
 *
 * Model IDs / pricing (confirmed via the claude-api reference): default
 * `claude-opus-4-8` ($5 / $25 per 1M input/output tokens). Opus 4.8 rejects
 * `temperature` and `budget_tokens`, so neither is sent.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const PROVIDER = 'anthropic';

const isEnabled = () =>
  process.env.HOSTED_LLM_ENABLED === 'true' && !!process.env.ANTHROPIC_API_KEY;

const intEnv = (name, fallback) => {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

const utcDateKey = () => new Date().toISOString().slice(0, 10);

/** Consume one unit of the hosted daily budget. Fails CLOSED (deny) on error. */
const withinBudget = async () => {
  const cap = intEnv('HOSTED_LLM_DAILY_CAP', 200);
  if (cap === 0) return true; // explicit unlimited
  const key = `${PROVIDER}:${utcDateKey()}`;
  try {
    const doc = await ApiUsage.findOneAndUpdate(
      { key },
      { $inc: { count: 1 }, $setOnInsert: { provider: PROVIDER, dateKey: utcDateKey() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    const allowed = (doc?.count ?? 1) <= cap;
    if (!allowed) {
      console.warn(`[hostedAi] daily escalation cap reached (${cap}); degrading to local.`);
    }
    return allowed;
  } catch (err) {
    // Unlike the Places breaker (fail-open for availability), the hosted path
    // fails CLOSED so a counter glitch can't uncork unbounded paid spend.
    console.error('[hostedAi] budget check failed (failing closed):', err.message);
    return false;
  }
};

/**
 * Escalate a short reasoning prompt to hosted Claude. Returns the text, or null
 * if disabled / unconfigured / over budget / on any error (caller falls back).
 * @param {string} prompt  public business-level context only
 */
const callHosted = async (prompt, { maxTokens = 400, system } = {}) => {
  if (!isEnabled()) return null;
  if (!(await withinBudget())) return null;

  try {
    const res = await axios.post(
      ANTHROPIC_URL,
      {
        model: process.env.HOSTED_LLM_MODEL || 'claude-opus-4-8',
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        timeout: 30000,
      }
    );
    const blocks = res.data?.content;
    if (!Array.isArray(blocks)) return null;
    const text = blocks
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return text || null;
  } catch (err) {
    console.error('[hostedAi] escalation call failed:', err.response?.status || err.message);
    return null;
  }
};

module.exports = { isEnabled, callHosted };
