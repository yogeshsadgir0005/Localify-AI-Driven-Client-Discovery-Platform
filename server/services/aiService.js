const axios = require('axios');
const Category = require('../models/Category');

/**
 * aiService — the LLM layer for Phase 1, backed by a FREE hosted provider
 * (Groq, which serves open-source Llama models over an OpenAI-compatible API).
 * Every function degrades gracefully to a deterministic heuristic/template when
 * no key is set or the call fails, so the product never hard-depends on the
 * model. Set GROQ_API_KEY to enable the LLM path; leave it blank and everything
 * still works on the heuristics.
 *
 * Config:
 *   GROQ_API_KEY   free key from https://console.groq.com (required for LLM path)
 *   GROQ_MODEL     default 'llama-3.3-70b-versatile'
 *   GROQ_BASE_URL  default 'https://api.groq.com/openai/v1' (any OpenAI-compatible host works)
 */

const llmBase = () =>
  (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
const llmModel = () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

/**
 * Call the hosted LLM once. Returns the raw string, or null if unconfigured
 * (no GROQ_API_KEY) or unreachable — callers fall back to heuristics/templates.
 */
const callLlm = async (prompt, { timeout = 45000, maxTokens = 512, system, temperature = 0.4 } = {}) => {
  const key = process.env.GROQ_API_KEY;
  if (!key || !prompt) return null;
  try {
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    const res = await axios.post(
      `${llmBase()}/chat/completions`,
      { model: llmModel(), messages, max_tokens: maxTokens, temperature, stream: false },
      {
        headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        timeout,
      }
    );
    const text = res.data?.choices?.[0]?.message?.content;
    return (typeof text === 'string' ? text.trim() : '') || null;
  } catch (err) {
    console.error('[ai] LLM call failed:', err.response?.status || err.message);
    return null;
  }
};

// ---- Category cache (for heuristic parsing) -------------------------------
let categoryCache = null;
let categoryCacheAt = 0;
const CATEGORY_TTL_MS = 10 * 60 * 1000;

const loadCategories = async () => {
  const now = Date.now();
  if (categoryCache && now - categoryCacheAt < CATEGORY_TTL_MS) return categoryCache;
  categoryCache = await Category.find().lean();
  categoryCacheAt = now;
  return categoryCache;
};

const BUDGET_WORDS = {
  budget: ['cheap', 'budget', 'affordable', 'low cost', 'economical', 'sasta'],
  premium: ['premium', 'luxury', 'high end', 'high-end', 'best quality', 'top'],
};

/** Extract an MOQ (min pieces) from free text, e.g. "200 pcs", "MOQ 100". */
const extractMoq = (text) => {
  const m =
    /(?:moq|minimum|min\.?)\D{0,12}(\d{2,6})/i.exec(text) ||
    /(\d{2,6})\s*(?:pcs?|pieces|units|nos)/i.exec(text);
  return m ? parseInt(m[1], 10) : null;
};

/** Extract a timeline in days from text ("in 2 weeks", "within 10 days"). */
const extractTimelineDays = (text) => {
  const wk = /(\d{1,3})\s*week/i.exec(text);
  if (wk) return parseInt(wk[1], 10) * 7;
  const dy = /(\d{1,3})\s*day/i.exec(text);
  if (dy) return parseInt(dy[1], 10);
  return null;
};

const STOPWORDS = new Set(
  'a an the for and or to of in on with need want looking find me my we our i is are can you your near around'.split(
    ' '
  )
);

const tokenize = (text) =>
  (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));

/** Deterministic parse used as the fallback (and to fill LLM gaps). */
const heuristicParse = (rawText, categories) => {
  const lower = (rawText || '').toLowerCase();
  const matchedCats = [];
  let vertical = null;

  for (const cat of categories) {
    const needles = [cat.slug, cat.displayName?.en, ...(cat.synonyms || [])]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase());
    if (needles.some((n) => n && lower.includes(n))) {
      matchedCats.push(cat.slug);
      if (!vertical) vertical = cat.vertical;
    }
  }

  let budgetBand = null;
  for (const [band, words] of Object.entries(BUDGET_WORDS)) {
    if (words.some((w) => lower.includes(w))) budgetBand = band;
  }

  const moq = extractMoq(lower);

  return {
    vertical,
    categories: Array.from(new Set(matchedCats)),
    keywords: Array.from(new Set(tokenize(rawText))).slice(0, 12),
    moqBand: { min: moq, max: null },
    budgetBand,
    timelineDays: extractTimelineDays(lower),
    parsedBy: 'heuristic',
  };
};

/** Try to pull a JSON object out of an LLM response. */
const extractJson = (text) => {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

/**
 * Parse a buyer's free-text requirement into a structured brief.
 * LLM-first, heuristic fallback; the heuristic always fills any gaps.
 */
const parseRequirement = async (rawText) => {
  const categories = await loadCategories();
  const fallback = heuristicParse(rawText, categories);

  const verticals = Array.from(new Set(categories.map((c) => c.vertical)));
  const prompt = `Extract a structured sourcing brief from the buyer request. Respond with ONLY a JSON object, no prose.
Known verticals: ${verticals.join(', ') || 'none'}.
Fields: vertical (one of the known verticals or null), categories (array of short slugs), keywords (array), moqMin (integer or null), budgetBand ("budget"|"mid"|"premium"|null), timelineDays (integer or null).
Buyer request: """${(rawText || '').slice(0, 600)}"""
JSON:`;

  const raw = await callLlm(prompt, {
    timeout: 45000,
    maxTokens: 400,
    system: 'You extract structured sourcing briefs. Respond with ONLY a JSON object, no prose.',
  });
  const parsed = extractJson(raw);
  if (!parsed) return fallback;

  // Merge: prefer LLM values where sane, else heuristic.
  const vertical = verticals.includes(parsed.vertical) ? parsed.vertical : fallback.vertical;
  const moqMin =
    Number.isFinite(parsed.moqMin) && parsed.moqMin > 0 ? parsed.moqMin : fallback.moqBand.min;
  const budgetBand = ['budget', 'mid', 'premium'].includes(parsed.budgetBand)
    ? parsed.budgetBand
    : fallback.budgetBand;

  return {
    vertical,
    categories: Array.isArray(parsed.categories) && parsed.categories.length
      ? parsed.categories.map((s) => String(s).toLowerCase()).slice(0, 8)
      : fallback.categories,
    keywords: Array.isArray(parsed.keywords) && parsed.keywords.length
      ? parsed.keywords.map(String).slice(0, 12)
      : fallback.keywords,
    moqBand: { min: moqMin, max: null },
    budgetBand,
    timelineDays: Number.isFinite(parsed.timelineDays) ? parsed.timelineDays : fallback.timelineDays,
    parsedBy: 'llm',
  };
};

/**
 * Draft a short, warm introduction message for the BUYER to send themselves
 * after a contact is revealed. Never auto-sent. Falls back to a template.
 */
const draftIntro = async (buyerName, requirement, profile) => {
  const need = requirement?.rawText || 'your services';
  const template = `Hi ${profile.name} team, I'm ${buyerName || 'a buyer'} — I found you on LocalBiz. I'm looking for: ${need}. Are you available to discuss? Thank you!`;

  const prompt = `Write a short (under 60 words), warm, professional first message from a buyer to a business, to start a conversation. Do not invent prices or promises.
Buyer: ${buyerName || 'a buyer'}
Business: ${profile.name}
Need: ${need}
Message:`;
  const raw = await callLlm(prompt, { timeout: 45000, maxTokens: 200 });
  return { message: (raw && raw.length > 10 ? raw : template), fallback: !raw };
};

/**
 * Optionally produce a one-line LLM "why matched" explanation. Returns null if
 * Ollama is unavailable (callers fall back to deterministic template reasons).
 */
const explainMatch = async (requirement, profile) => {
  const prompt = `In one sentence, explain why this business fits the buyer's need. Be specific and factual; do not invent details.
Need: ${(requirement?.rawText || '').slice(0, 300)}
Business: ${profile.name} (${profile.vertical || 'business'}) in ${profile.location?.city || ''}. Categories: ${(profile.categories || []).join(', ')}.
Reason:`;
  const raw = await callLlm(prompt, { timeout: 30000, maxTokens: 120 });
  return raw ? raw.split('\n')[0].trim() : null;
};

module.exports = { callLlm, parseRequirement, draftIntro, explainMatch, heuristicParse };
