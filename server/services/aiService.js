const axios = require('axios');
const Category = require('../models/Category');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * aiService — the LLM layer for Phase 1, backed by the Google Gemini API.
 * Every function degrades gracefully to a deterministic heuristic/template when
 * no key is set or the call fails, so the product never hard-depends on the model.
 * 
 * Config:
 *   GEMINI_API_KEY   free key from Google AI Studio (1 Million TPM limit)
 */

const llmModel = () => 'gemini-2.5-flash';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Call the hosted LLM once with built-in retry logic.
 */
const callLlm = async (prompt, { timeout = 45000, maxTokens = 8192, system, temperature = 0.4, model } = {}, retries = 2) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !prompt) return null;
  const genAI = new GoogleGenerativeAI(key);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const genModel = genAI.getGenerativeModel({
        model: model || llmModel(),
        systemInstruction: system || undefined,
      });

      const controller = new AbortController();
      let timeoutId;
      
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error('LLM_TIMEOUT'));
        }, timeout);
      });
      
      const genPromise = genModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      });
      
      const result = await Promise.race([genPromise, timeoutPromise]);
      
      clearTimeout(timeoutId);
      const text = result.response.text();
      return (typeof text === 'string' ? text.trim() : '') || null;
    } catch (err) {
      console.error(`[ai] LLM call failed (Attempt ${attempt + 1}/${retries + 1}):`, err.message);
      if ((err.status === 429 || err.status === 503 || err.message === 'LLM_TIMEOUT') && attempt < retries) {
        console.log(`[ai] API limit or overload (Status ${err.status || err.message}). Waiting 5 seconds before retry...`);
        await sleep(5000);
        continue;
      }
      if (attempt === retries) return null;
    }
  }
  return null;
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

const fetchImageAsGenerativePart = async (url) => {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return {
      inlineData: {
        data: Buffer.from(response.data).toString("base64"),
        mimeType: response.headers['content-type'] || 'image/jpeg'
      },
    };
  } catch (error) {
    console.warn('[ai] Failed to fetch image for vision:', error.message);
    return null;
  }
};

/**
 * Call the hosted LLM with vision capabilities.
 */
const callLlmVision = async (prompt, imageUrls, { timeout = 60000, maxTokens = 256, temperature = 0.2 } = {}) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !prompt || !imageUrls || !imageUrls.length) return null;
  const genAI = new GoogleGenerativeAI(key);
  
  try {
    // Add up to 3 images to keep within reasonable payload limits
    const imagesToAnalyze = imageUrls.slice(0, 3);
    const imageParts = await Promise.all(imagesToAnalyze.map(url => fetchImageAsGenerativePart(url)));
    const validParts = imageParts.filter(Boolean);
    
    if (!validParts.length) return null; // No valid images fetched

    const genModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await genModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }, ...validParts] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature }
    });
    
    return result.response.text();
  } catch (err) {
    console.error('[ai] Vision LLM call failed:', err.message);
    return null;
  }
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
 * Generate fallback copy when the LLM is unavailable or fails.
 * Uses business context to produce decent template-based content.
 */
const fallbackCopy = (business) => {
  const name = business.name || 'Our Business';
  const cats = (business.categories || []).join(', ') || 'services';
  const city = business.location?.city || 'your area';
  return {
    pillText: `Premium ${cats}`,
    heroHeadline: 'Experience the Best of',
    heroHighlight: name,
    heroSubtitle: `Discover why ${name} is the trusted choice for ${cats} in ${city}. Quality, reliability, and excellence — all in one place.`,
    heroCta: 'Get in Touch',
    heroSecondaryCta: 'Learn More',
    trustBadges: ['Trusted Locally', 'Premium Quality', 'Expert Team'],
    stepsHeadline: `Getting Started with ${name}`,
    steps: [
      { title: 'Discover', desc: `Explore what ${name} has to offer across our range of ${cats}.` },
      { title: 'Connect', desc: 'Reach out to us directly — we respond quickly and personally.' },
      { title: 'Experience', desc: 'Visit us and discover the difference that quality makes.' },
    ],
    featuresPill: `Why ${name}`,
    featuresHeadline: `What Makes ${name} Stand Out`,
    features: [
      { title: 'Unmatched Quality', desc: `We take pride in delivering the highest standard of ${cats} in ${city}.` },
      { title: 'Customer First', desc: 'Every interaction is built around your needs and satisfaction.' },
      { title: 'Local Expertise', desc: `Years of experience serving the ${city} community.` },
      { title: 'Fair Pricing', desc: 'Transparent, competitive pricing with no hidden costs.' },
      { title: 'Reliable Service', desc: 'Consistent, dependable quality you can count on every time.' },
    ],
    stats: [
      { value: '500+', label: 'Happy Customers' },
      { value: '5+', label: 'Years of Service' },
      { value: '100%', label: 'Satisfaction' },
    ],
    testimonials: [
      { quote: `${name} exceeded all my expectations. Their attention to detail and quality of service is remarkable.`, name: 'Priya S.', role: 'Regular Customer', rating: 5 },
      { quote: `Best in ${city}, hands down. Professional, reliable, and always delivers on promises.`, name: 'Rahul M.', role: 'Business Client', rating: 5 },
      { quote: 'Incredible experience from start to finish. Would recommend to anyone looking for quality.', name: 'Anita K.', role: 'First-time Visitor', rating: 5 },
    ],
    ctaHeadline: `Ready to Experience ${name}?`,
    ctaSubtitle: `Join hundreds of satisfied customers in ${city}. Reach out today and let us show you the difference.`,
    ctaCta: 'Contact Us Today',
    footerTagline: `Your trusted partner for ${cats} in ${city}. Quality and service, guaranteed.`,
  };
};

/**
 * Ask the LLM to generate ONLY business-specific copywriting (no code).
 * Returns a structured content object that gets injected into the premium HTML template.
 * Falls back to fallbackCopy when the LLM is unavailable or returns bad data.
 */
const generateWebsiteCopy = async (business, survey, brandContext = {}) => {
  const name = business.name || 'Our Business';
  const cats = (business.categories || []).join(', ') || 'services';
  const city = business.location?.city || '';
  const vibe = brandContext.theme || 'Modern, premium, clean';

  const surveyContext = Object.entries(survey || {})
    .filter(([k]) => k !== 'color')
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');

  const prompt = `You are a world-class copywriter. Write compelling, unique website copy for a local business. The copy must feel premium, authentic, and tailored specifically to THIS business — never generic.

Business: "${name}"
Category: ${cats}
Location: ${city || 'India'}
Brand Vibe: ${vibe}
${surveyContext ? `Style Preferences: ${surveyContext}` : ''}

Respond with ONLY a JSON object containing these exact keys (no markdown, no explanation):
{
  "pillText": "short 2-4 word badge text for the hero (e.g. 'Award-Winning Cuisine')",
  "heroHeadline": "first part of the hero headline, 3-6 words (BEFORE the highlighted word)",
  "heroHighlight": "1-3 highlighted gradient words (the punch of the headline)",
  "heroSubtitle": "1-2 compelling sentences that make people want to visit/contact",
  "heroCta": "primary call-to-action button text, 2-4 words",
  "heroSecondaryCta": "secondary button text, 2-3 words",
  "trustBadges": ["badge1", "badge2", "badge3"],
  "stepsHeadline": "compelling heading for the 'how it works' section",
  "steps": [{"title": "short title", "desc": "1 sentence"}, {"title": "", "desc": ""}, {"title": "", "desc": ""}],
  "featuresPill": "2-3 word section badge",
  "featuresHeadline": "compelling heading for features section",
  "features": [{"title": "short", "desc": "1 sentence"}, ...(5 total)],
  "stats": [{"value": "500+", "label": "Happy Customers"}, ...(3 total, values like '10+', '500+', '100%', '24/7')],
  "testimonials": [{"quote": "realistic testimonial", "name": "Indian name", "role": "role", "rating": 5}, ...(3 total)],
  "ctaHeadline": "compelling final CTA heading",
  "ctaSubtitle": "1-2 sentences encouraging action",
  "ctaCta": "CTA button text",
  "footerTagline": "1 sentence brand tagline"
}

RULES:
- Write copy as if you've been hired by ${name} to create their dream website.
- If it's a restaurant, write mouth-watering food copy. If it's a salon, write beauty/confidence copy. If it's a service, write trust/expertise copy.
- NEVER use generic phrases like "Welcome to [Name]" or "Premium Quality Guaranteed" or "Discover the Best".
- Make testimonials sound natural and realistic with Indian names.
- Stats should be plausible for a local business (not millions).
- Keep all text SHORT and punchy. Headlines under 8 words. Descriptions under 25 words.
- Output ONLY the JSON. No prose before or after.`;

  const raw = await callLlm(prompt, {
    timeout: 60000,
    maxTokens: 2000,
    temperature: 0.6,
    system: 'You are a world-class copywriter for local businesses. Output ONLY valid JSON, no markdown formatting.',
  });

  const parsed = extractJson(raw);
  if (!parsed || !parsed.heroHeadline) {
    console.warn('[ai] Website copy generation failed, using fallback.');
    return fallbackCopy(business);
  }

  // Merge with fallback to fill any missing fields
  const fb = fallbackCopy(business);
  return {
    pillText: parsed.pillText || fb.pillText,
    heroHeadline: parsed.heroHeadline || fb.heroHeadline,
    heroHighlight: parsed.heroHighlight || fb.heroHighlight,
    heroSubtitle: parsed.heroSubtitle || fb.heroSubtitle,
    heroCta: parsed.heroCta || fb.heroCta,
    heroSecondaryCta: parsed.heroSecondaryCta || fb.heroSecondaryCta,
    trustBadges: Array.isArray(parsed.trustBadges) && parsed.trustBadges.length >= 3 ? parsed.trustBadges.slice(0, 3) : fb.trustBadges,
    stepsHeadline: parsed.stepsHeadline || fb.stepsHeadline,
    steps: Array.isArray(parsed.steps) && parsed.steps.length >= 3 ? parsed.steps.slice(0, 3) : fb.steps,
    featuresPill: parsed.featuresPill || fb.featuresPill,
    featuresHeadline: parsed.featuresHeadline || fb.featuresHeadline,
    features: Array.isArray(parsed.features) && parsed.features.length >= 5 ? parsed.features.slice(0, 5) : fb.features,
    stats: Array.isArray(parsed.stats) && parsed.stats.length >= 3 ? parsed.stats.slice(0, 3) : fb.stats,
    testimonials: Array.isArray(parsed.testimonials) && parsed.testimonials.length >= 3 ? parsed.testimonials.slice(0, 3) : fb.testimonials,
    ctaHeadline: parsed.ctaHeadline || fb.ctaHeadline,
    ctaSubtitle: parsed.ctaSubtitle || fb.ctaSubtitle,
    ctaCta: parsed.ctaCta || fb.ctaCta,
    footerTagline: parsed.footerTagline || fb.footerTagline,
  };
};

/**
 * Generate a premium website for a business.
 * Strategy: LLM writes ONLY the copywriting, which gets injected into a
 * pre-built premium HTML template matching Localify's own design quality.
 * Returns { html } — a single self-contained HTML document.
 */
const generateReactWebsite = async (business, survey, brandContext = {}, onProgress = null) => {
  const brandColor = survey?.color || brandContext.color || '#6C63FF';
  const category = (business.categories || [])[0] || 'business';
  const name = business.name || 'Our Business';
  const city = business.location?.city || '';
  const vibe = brandContext.theme || 'Modern, premium, clean';
  const reviewContext = (business.reviews || []).slice(0, 3).map(r => `"${r.text}"`).join(' | ');

  const surveyContext = Object.entries(survey || {})
    .filter(([k]) => k !== 'color')
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');

  const contextStr = `Business: "${name}"\nCategory: ${category}\nLocation: ${city}\nBrand Color: ${brandColor}\nBrand Vibe: ${vibe}\nReviews: ${reviewContext}\n${surveyContext ? `Preferences: ${surveyContext}` : ''}`;

  console.log(`[ai] Phase 0: Architecting structure for ${name}...`);
  if (onProgress) onProgress({ status: 'Phase 0', message: 'Architecting layout & theme...', progress: 10 });
  
  const architectPrompt = `You are an elite UI/UX Designer.
We are building a premium Tailwind HTML landing page for a local business.
Context:
${contextStr}

Output a JSON object with this exact structure:
{
  "theme": "Describe the design system, e.g. Dark mode (bg-[#0D0F14]), fonts: Inter, glassmorphism cards, glowing neon accents similar to SaaS landing pages.",
  "blueprint": ["Header & Nav", "Hero with CTA", "Features", "Testimonials", "Footer"]
}
Output ONLY the JSON object, no prose.`;

  const architectRaw = await callLlm(architectPrompt, {
    maxTokens: 500,
    temperature: 0.5,
    model: 'gemini-2.5-flash',
    system: 'Output ONLY a valid JSON object.'
  }, 1);

  let plan = { blueprint: ["Header & Nav", "Hero", "Features & Services", "Testimonials", "Footer"], theme: "Dark premium SaaS look" };
  const extracted = extractJson(architectRaw);
  if (extracted && extracted.blueprint) {
    plan = extracted;
  }
  
  const sections = plan.blueprint;
  console.log(`[ai] Blueprint established:`, sections);

  const designRules = `DESIGN RULES (STRICTLY ENFORCED):
1. Tailwind CSS: You MUST use Tailwind CSS utility classes. (Assume CDN is already in the <head>). Use 'font-sans' (Inter) globally.
2. Aesthetics: ${plan.theme}. MUST look extremely premium, mimicking high-end apps like Localify.
3. Typography & Glass: Liberally use backdrop-blur-md, bg-white/5 borders, glowing gradients.
4. DO NOT use 'h-screen' or 'overflow-hidden' on major sections (this breaks scrolling). Use 'min-h-[70vh]' instead of 'h-screen' if needed.
5. Copywriting: Write compelling, business-specific copy using the real Google Reviews provided. DO NOT use generic lorem ipsum.`;

  let fullHtml = `<!DOCTYPE html>\n<html lang="en" class="scroll-smooth">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${name}</title>\n<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">\n<script src="https://cdn.tailwindcss.com"></script>\n<script>tailwind.config={theme:{extend:{fontFamily:{sans:['Inter','sans-serif']}}}}</script>\n<script src="https://unpkg.com/lucide@latest"></script>\n<style>\nbody { background-color: #0D0F14; color: #E8EAF0; }\n@keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }\n.animate-float { animation: float 6s ease-in-out infinite; }\n</style>\n</head>\n<body class="antialiased">\n`;

  if (onProgress) onProgress({ status: 'Phase 1', message: 'Writing full website code... (This takes about 20s)', progress: 40 });
  console.log(`[ai] Phase 1: Generating full website in one go...`);
  
  const pagePrompt = `You are an elite Frontend Developer.
We are building a complete, premium Tailwind website for a local business in one single go.
${contextStr}

${designRules}

Website Blueprint Sections to Include (in order): ${sections.join(' -> ')}
Your task: Write the RAW HTML for the ENTIRE website layout according to the blueprint. Make it comprehensive, beautiful, and fully fleshed out with real copy.
Output ONLY the raw HTML content that goes inside the <body> tag. Do NOT output the <html>, <head>, or <body> tags. Do NOT use markdown codeblocks. Just the raw HTML elements.`;

  const fullPageHtml = await callLlm(pagePrompt, {
    maxTokens: 8192,
    timeout: 600000,
    temperature: 0.7,
    model: 'gemini-2.5-flash',
    system: 'You are an elite web developer. Output ONLY raw HTML without markdown formatting or markdown code blocks.',
  }, 2);

  if (!fullPageHtml) {
    console.error(`[ai] FATAL: Failed to generate full website.`);
    throw new Error(`AI failed to generate website. Please try again.`);
  }

  if (onProgress) onProgress({ status: 'Phase 1', message: 'Polishing layout...', progress: 85 });

  let cleanHtml = fullPageHtml.replace(/```html/gi, '').replace(/```/g, '').trim();
  fullHtml += `\n<!-- Website Body -->\n${cleanHtml}\n`;

  fullHtml += `\n<script>lucide.createIcons();</script>\n</body>\n</html>`;
  console.log(`[ai] Compilation complete. Total length: ${fullHtml.length}`);
  
  if (onProgress) onProgress({ status: 'Complete', message: 'Finalizing code...', progress: 100 });
  
  if (fullHtml.length < 2000) { // If it's too small, something failed deeply
     throw new Error("AI failed to generate complete website code. Please try again.");
  }
  
  return { html: fullHtml };
};

module.exports = { callLlm, callLlmVision, parseRequirement, draftIntro, explainMatch, heuristicParse, analyzeBusinessImages, generateReactWebsite };
