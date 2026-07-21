const axios = require('axios');
const Category = require('../models/Category');

/**
 * aiService — the LLM layer for Phase 1, backed by NVIDIA Nemotron.
 * Every function degrades gracefully to a deterministic heuristic/template when
 * no key is set or the call fails, so the product never hard-depends on the model.
 * 
 * Config:
 *   NVIDIA_API_KEY   key for integrate.api.nvidia.com
 */

const llmModel = () => process.env.LLM_MODEL_REASONING || 'nvidia/nemotron-3-ultra-550b-a55b';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- Request Queue: Concurrency of 2 to match 2 API keys ----
const concurrencyLimit = 1;
let activeCount = 0;
const queue = [];

const enqueueRequest = (fn) => {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    processQueue();
  });
};

const processQueue = async () => {
  if (activeCount >= concurrencyLimit || queue.length === 0) return;
  activeCount++;
  const { fn, resolve, reject } = queue.shift();
  try {
    resolve(await fn());
  } catch (err) {
    reject(err);
  } finally {
    activeCount--;
    processQueue();
  }
};

let keyIndex = 0;
const getNextKey = () => {
  const keys = [
    process.env.NVIDIA_API_KEY,
    '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'
  ].filter(Boolean);
  if (keys.length === 0) return null;
  const key = keys[keyIndex % keys.length];
  keyIndex++;
  return key;
};


/**
 * The strict system prompt prepended to every call.
 * This tells the AI about ALL our constraints upfront so it doesn't
 * produce outputs that break our parser.
 */
const STRICT_JSON_SYSTEM = `You are a JSON-only API. You MUST follow these rules:
1. Output ONLY valid JSON. No markdown, no prose, no explanations before or after.
2. Do NOT wrap your output in \`\`\`json code fences.
3. Do NOT output <think> blocks or reasoning traces.
4. Start your response with { or [ and end with } or ].
5. Keep your response concise — you have limited output tokens.
6. If asked for HTML inside JSON, use double quotes and escape inner quotes properly.
CRITICAL: Any text outside the JSON structure will cause a system crash. Output ONLY the JSON.`;

/**
 * Call the hosted LLM once with built-in retry logic.
 * All calls are limited to a concurrency of 2.
 */
const callLlm = async (prompt, { timeout = 1200000, maxTokens = 16384, system, temperature = 0.4, model, expectJson = true } = {}, retries = 10) => {
  if (!prompt) return null;

  return enqueueRequest(async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const key = getNextKey();
      if (!key) return null;
      
      try {
        const messages = [];
        // Use strict JSON system prompt if expectJson is true
        let fullSystem = system || '';
        if (expectJson) {
          fullSystem = system ? `${STRICT_JSON_SYSTEM}\n\nAdditional instructions: ${system}` : STRICT_JSON_SYSTEM;
        } else if (!fullSystem) {
          fullSystem = 'You are a helpful coding assistant. Follow instructions exactly.';
        }

        // Nemotron reasoning models emit chain-of-thought by default. The control
        // token "detailed thinking off" as the FIRST line of the system message
        // disables it — critical so reasoning never leaks into HTML/JSON output.
        const activeModel = model || llmModel();
        if (activeModel.includes('nemotron')) {
          fullSystem = `detailed thinking off\n\n${fullSystem}`;
        }

        messages.push({ role: 'system', content: fullSystem });
        messages.push({ role: 'user', content: prompt });

        const payload = {
          model: model || llmModel(),
          messages,
          temperature,
          top_p: 0.95,
          max_tokens: maxTokens,
          stream: false,
        };

        // Nemotron-specific: DISABLE thinking mode to prevent <think> blocks
        // and ensure all tokens go to actual JSON output
        if (payload.model.includes('nemotron')) {
          payload.max_tokens = maxTokens;
          // Do NOT set reasoning_budget or enable_thinking — this wastes tokens
          // and produces <think> blocks that break JSON parsing
        }

        const response = await axios.post(
          'https://integrate.api.nvidia.com/v1/chat/completions',
          payload,
          {
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            timeout: timeout,
          }
        );

        const choice = response.data?.choices?.[0];
        let text = choice?.message?.content;
        if (typeof text !== 'string' || !text.trim()) {
          console.warn(`[ai] Empty response from LLM on attempt ${attempt + 1}`);
          if (attempt < retries) { await sleep(2000); continue; }
          return null;
        }
        return text.trim();
      } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data?.error?.message || err.response?.data?.detail || err.message;
        console.error(`[ai] LLM call failed (Attempt ${attempt + 1}/${retries + 1}):`, msg);
        
        if ((status === 429 || status === 503 || err.code === 'ECONNABORTED' || err.message?.includes('timeout') || err.message?.includes('ResourceExhausted')) && attempt < retries) {
          const backoff = Math.min(5000 * Math.pow(2, attempt), 30000);
          console.log(`[ai] API limit or overload (Status ${status || err.code}). Waiting ${backoff/1000}s before retry...`);
          await sleep(backoff);
          continue;
        }
        if (attempt === retries) return null;
      }
    }
    return null;
  });
};

/**
 * callLlmVision — multimodal call for analyzing images (screenshots, photos).
 * Accepts data: URLs or http(s) URLs. Degrades gracefully to null on any error
 * so callers can proceed text-only. Used by the screenshot bug-fix feature.
 */
const callLlmVision = async (prompt, imageUrls, { timeout = 600000, maxTokens = 700, model } = {}) => {
  if (!prompt) return null;
  // NVIDIA's inline-image endpoint rejects base64 images larger than ~180KB with
  // a 400. Drop oversized ones up front so we don't fire a doomed request (the
  // caller degrades gracefully on null).
  const INLINE_LIMIT = 180000;
  const imgs = (Array.isArray(imageUrls) ? imageUrls : [imageUrls])
    .filter(u => typeof u === 'string' && u)
    .filter(u => !u.startsWith('data:') || u.length <= INLINE_LIMIT)
    .slice(0, 3);
  if (imgs.length === 0) {
    console.warn('[ai] Vision skipped: no image within the inline size limit.');
    return null;
  }

  return enqueueRequest(async () => {
    const key = getNextKey();
    if (!key) return null;
    try {
      const content = [{ type: 'text', text: prompt }];
      imgs.forEach((url) => content.push({ type: 'image_url', image_url: { url } }));

      const response = await axios.post(
        'https://integrate.api.nvidia.com/v1/chat/completions',
        {
          model: model || process.env.LLM_MODEL_VISION || 'meta/llama-3.2-90b-vision-instruct',
          messages: [{ role: 'user', content }],
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: maxTokens,
          stream: false,
        },
        { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout }
      );

      const text = response.data?.choices?.[0]?.message?.content;
      return (typeof text === 'string' && text.trim()) ? text.trim() : null;
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.detail || err.message;
      console.error('[ai] Vision call failed:', msg);
      return null;
    }
  });
};

// ---- Category cache (for heuristic parsing) -------------------------------
let categoryCache = null;
let categoryCacheAt = 0;
const CATEGORY_TTL = 3600_000;     // 1 hour

const getCats = async () => {
  if (categoryCache && Date.now() - categoryCacheAt < CATEGORY_TTL) return categoryCache;
  try {
    categoryCache = await Category.find({}).lean();
    categoryCacheAt = Date.now();
  } catch { categoryCache = []; }
  return categoryCache;
};

// ---- extract JSON from an LLM response ----
const extractJson = (raw) => {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
};

/**
 * parseRequirement — uses the LLM to convert a free-text client request
 * into structured search filters.
 */
const parseRequirement = async (text) => {
  if (!text || text.trim().length < 3) return {};

  const cats = await getCats();
  const catNames = cats.map(c => c.name).join(', ');

  const prompt = `Parse this client requirement into structured search filters.
Requirement: "${text}"

Available categories: ${catNames}

Return JSON with these fields (omit fields you can't infer):
{
  "categories": ["matching category names"],
  "minRating": 4.0,
  "keywords": ["relevant", "search", "terms"],
  "priceLevel": 2,
  "intent": "what the client wants in one sentence"
}`;

  const raw = await callLlm(prompt, { maxTokens: 300, temperature: 0.2 });
  return extractJson(raw) || heuristicParse(text, cats);
};

const heuristicParse = (text, cats = []) => {
  const lower = text.toLowerCase();
  const matched = cats.filter(c =>
    lower.includes(c.name.toLowerCase()) ||
    (c.keywords || []).some(k => lower.includes(k.toLowerCase()))
  );
  return {
    categories: matched.map(c => c.name),
    keywords: text.split(/[\s,]+/).filter(w => w.length > 2),
    intent: text.slice(0, 120),
  };
};

/**
 * draftIntro — generate a personalised intro message for a matched business.
 */
const draftIntro = async (business, requirement) => {
  const prompt = `Write a brief, friendly 2-3 sentence intro message from a potential client to this business.
Business: ${business.name} (${(business.categories||[]).join(', ')})
Rating: ${business.rating || 'N/A'} with ${business.reviewCount || 0} reviews
Client needs: ${requirement}
Be specific to the business and mention one positive aspect.`;
  const raw = await callLlm(prompt, { maxTokens: 200, temperature: 0.7 });
  return raw ? raw.split('\n')[0].trim() : null;
};

/**
 * explainMatch — one-liner explaining why a business is a good match.
 */
const explainMatch = async (business, filters) => {
  const prompt = `In exactly one sentence explain why "${business.name}" (${(business.categories||[]).join(', ')}, rating ${business.rating||'N/A'}) is a good match for someone looking for: ${filters.intent || filters.keywords?.join(', ') || 'a service provider'}.`;
  const raw = await callLlm(prompt, { maxTokens: 100, temperature: 0.3 });
  return raw ? raw.split('\n')[0].trim() : null;
};

/**
 * Analyze business photos to extract primary brand color and theme.
 */
const analyzeBusinessImages = async (photoUrls) => {
  if (!photoUrls || !photoUrls.length) {
    return { color: '#3B82F6', theme: 'Modern and clean (Default)' };
  }
  
  const prompt = `Analyze these photos of a business. Look for posters, signs, logos, or storefronts.
Respond with ONLY a JSON object containing two keys: "color" and "theme".
- "color": A hex code representing the most dominant brand color (e.g. "#E53E3E").
- "theme": A short 3-5 word description of the visual vibe (e.g. "Rustic coffee shop vibe").
Do not include markdown or explanations. Just the JSON object.`;

  const raw = await callLlmVision(prompt, photoUrls);
  const parsed = extractJson(raw);
  
  return {
    color: parsed?.color || '#3B82F6',
    theme: parsed?.theme || 'Modern and clean',
  };
};

/**
 * Generate a full single-page React website using AI.
 */
const generateReactWebsite = async (business, survey) => {
  const name = business.name || 'Business';
  const category = (business.categories || [])[0] || 'business';
  const city = business.location?.city || '';
  const reviewSnippets = (business.reviews || []).slice(0, 3).map(r => `"${r.text}"`).join(' | ');

  const prompt = `Generate a modern, professional single-page website for:
Business: "${name}"
Category: ${category}
Location: ${city}
Reviews: ${reviewSnippets}

Create complete, production-ready HTML with embedded CSS. Include:
1. Hero section with business name and tagline
2. About/Services section
3. Testimonials from reviews
4. Contact section
5. Footer

Use a modern dark theme with the brand color ${survey?.color || '#6C63FF'}.
Return ONLY the complete HTML document, no markdown.`;

  return await callLlm(prompt, { maxTokens: 8192, temperature: 0.5 });
};

module.exports = { callLlm, callLlmVision, parseRequirement, draftIntro, explainMatch, heuristicParse, analyzeBusinessImages, generateReactWebsite };
