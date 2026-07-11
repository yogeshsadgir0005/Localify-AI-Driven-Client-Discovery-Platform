const crypto = require('crypto');
const { callLlm, callLlmVision } = require('./aiService');

/**
 * ============================================================================
 * PIPELINE V4.0 — PER-SECTION GENERATION ARCHITECTURE
 * ============================================================================
 * Phase 1: Strategy+Design → Architect (detailed per-section plans)
 * Phase 2: Generate EACH section individually (1 LLM call per section)
 * Phase 3: Auto-fill missing sections → QA Review → Assembly
 * 
 * This eliminates token truncation entirely — each section gets its own
 * full token budget. Quality is maximized because the AI focuses on one
 * section at a time with full context.
 * 
 * Total LLM calls: 2 (planning) + N (sections) + 1 (QA) = ~9-10
 * Target time: 5-9 minutes | Hard cap: 11 minutes
 * ============================================================================
 */
const PIPELINE_CONFIG = {
  models: {
    reasoning: process.env.LLM_MODEL_REASONING || 'nvidia/nemotron-3-ultra-550b-a55b',
    coder: process.env.LLM_MODEL_CODER || 'nvidia/nemotron-3-ultra-550b-a55b',
  },
  timeouts: {
    global: 900000,     // 15 minutes hard cap
    planning: 180000,   // 3 minutes per planning call
    section: 120000,    // 2 minutes per section generation
    qa: 120000,         // 2 minutes for QA
  },
  maxQaRetries: 1,
  promptVersion: '7.0',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

const getContextHash = (contextStr) => {
  return crypto.createHash('sha256').update(contextStr).digest('hex');
};

// ============================================================================
// ROBUST JSON EXTRACTION (string-aware, handles truncated arrays)
// ============================================================================

const extractJsonRobust = (text) => {
  if (!text) return null;
  
  let clean = text;
  clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '');
  clean = clean.replace(/<think>[\s\S]*/gi, '');
  clean = clean.replace(/```json\s*/gi, '').replace(/```\s*/gi, '');
  
  const firstBrace = clean.indexOf('{');
  const firstBracket = clean.indexOf('[');
  let jsonStart = -1;
  
  if (firstBrace === -1 && firstBracket === -1) return null;
  if (firstBrace === -1) jsonStart = firstBracket;
  else if (firstBracket === -1) jsonStart = firstBrace;
  else jsonStart = Math.min(firstBrace, firstBracket);
  
  clean = clean.substring(jsonStart).trim();
  
  try { return JSON.parse(clean); } catch (e) {}
  
  const lastBrace = clean.lastIndexOf('}');
  const lastBracket = clean.lastIndexOf(']');
  const jsonEnd = Math.max(lastBrace, lastBracket);
  if (jsonEnd > 0) {
    try { return JSON.parse(clean.substring(0, jsonEnd + 1)); } catch (e) {}
  }
  
  let fixed = clean.substring(0, (jsonEnd > 0 ? jsonEnd + 1 : clean.length));
  fixed = fixed.replace(/,\s*([\]}])/g, '$1');
  try { return JSON.parse(fixed); } catch (e) {}
  
  // Incremental object extraction for truncated arrays
  if (clean.startsWith('[')) {
    const objects = [];
    let i = 1;
    while (i < clean.length) {
      while (i < clean.length && (clean[i] === ' ' || clean[i] === '\n' || clean[i] === '\r' || clean[i] === '\t' || clean[i] === ',')) i++;
      if (i >= clean.length || clean[i] === ']') break;
      if (clean[i] === '{') {
        let depth = 0, inString = false, escaped = false, objStart = i;
        for (let j = i; j < clean.length; j++) {
          const ch = clean[j];
          if (escaped) { escaped = false; continue; }
          if (ch === '\\' && inString) { escaped = true; continue; }
          if (ch === '"' && !escaped) { inString = !inString; continue; }
          if (!inString) {
            if (ch === '{') depth++;
            if (ch === '}') depth--;
            if (depth === 0) {
              try {
                const obj = JSON.parse(clean.substring(objStart, j + 1));
                if (obj) objects.push(obj);
              } catch (e) {}
              i = j + 1;
              break;
            }
          }
          if (j === clean.length - 1 && depth > 0) i = clean.length;
        }
        if (depth > 0) break;
      } else { i++; }
    }
    if (objects.length > 0) {
      console.log(`[ai] Extracted ${objects.length} objects from truncated JSON array`);
      return objects;
    }
  }
  
  // Object repair for truncated objects
  if (clean.startsWith('{')) {
    let repaired = clean;
    repaired = repaired.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');
    const openB = (repaired.match(/\{/g) || []).length;
    const closeB = (repaired.match(/\}/g) || []).length;
    for (let i = 0; i < openB - closeB; i++) repaired += '}';
    repaired = repaired.replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(repaired); } catch (e) {}
  }
  
  return null;
};

// ============================================================================
// HTML TAG BALANCER — the single most important structural safeguard.
// Each section is generated in its own LLM call and can be truncated mid-tag
// (token limit) or emitted with a stray unclosed <div>. When we concatenate
// sections, one unclosed tag makes the browser nest every LATER section inside
// the broken one → overlaps + a "disappearing" footer. Balancing each section
// in isolation guarantees a truncated/buggy section can NEVER corrupt the ones
// after it.
// ============================================================================

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

const balanceHtml = (html) => {
  if (!html) return html;
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const isClosing = m[1] === '/';
    const name = m[2].toLowerCase();
    const selfClosed = m[3] === '/';
    if (VOID_TAGS.has(name) || selfClosed) continue;
    if (isClosing) {
      // Pop back to the matching open tag (tolerates minor mis-nesting).
      const idx = stack.lastIndexOf(name);
      if (idx !== -1) stack.length = idx;
    } else {
      stack.push(name);
    }
  }
  let out = html.trimEnd();
  for (let i = stack.length - 1; i >= 0; i--) out += `</${stack[i]}>`;
  return out;
};

// Detect a light theme from a background hex so glass/borders/text stay visible
// on EITHER theme (white overlays are invisible on light sites, and vice-versa).
const isLightHex = (hex) => {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return false;
  const lum = (0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4, 6), 16)) / 255;
  return lum > 0.6;
};

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Google business names are often keyword/location-stuffed
// ("Arambh Merch | CUSTOM T-Shirt Manufacturing & DTF Printing - NASHIK,KOPARGAON").
// Extract the clean brand name for logos/nav/headings so we never show the address.
const cleanBusinessName = (raw) => {
  let n = String(raw || '').trim();
  if (!n) return 'Our Business';
  n = n.split('|')[0].trim();                                  // drop "| keyword tagline"
  n = n.replace(/\s*[-–—]\s*[A-Z0-9 ,.&/]{5,}$/, '').trim();   // drop " - ALLCAPS LOCATION LIST"
  n = n.replace(/,\s*[A-Za-z ]+$/, m => (n.length - m.length < 3 ? m : '')).trim(); // trailing ", City"
  // If cleaning nuked everything, fall back to the first 4 words of the original.
  if (n.length < 2) n = String(raw).split(/\s+/).slice(0, 4).join(' ');
  return n;
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Some models (Nemotron) emit chain-of-thought as PLAIN PROSE before the HTML,
// with no <think> tags. This slices out just the real element: from the root
// opening tag (prefer the one carrying our id) to its final closing tag,
// dropping any reasoning before it and any commentary after it.
const extractRootTag = (html, tag, id) => {
  if (!html) return '';
  let start = -1;
  if (id) {
    const m = html.search(new RegExp(`<${tag}\\b[^>]*\\bid=["']${escapeRegExp(id)}["']`, 'i'));
    if (m >= 0) start = m;
  }
  if (start < 0) start = html.search(new RegExp(`<${tag}\\b`, 'i'));
  if (start < 0) return '';           // no real root element found at all
  let h = html.slice(start);
  const close = `</${tag}>`;
  const last = h.toLowerCase().lastIndexOf(close);
  if (last >= 0) h = h.slice(0, last + close.length);
  return h.trim();
};

// Detects reasoning/chain-of-thought that leaked into a section as TEXT content
// (the model opened <section> then wrote its plan instead of markup). These
// phrases are echoes of our own prompt or planning voice — vanishingly rare in
// real website copy — so any hit means the section is garbage and must be redone.
const REASONING_MARKERS = [
  'the user wants', 'let me build', 'let me start', 'let me analyze', 'let me think',
  "i can't write custom", 'i cannot write custom', 'inner wrapper:',
  'heading block', 'decorative background layer', "here's the plan",
  'first, the section', 'structural contract', 'i will create the', "i'll use an svg",
  'layout safety law', 'per the checklist', 'as an assistant', 'i need to build',
];
const looksLikeReasoning = (html) => {
  const text = (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  return REASONING_MARKERS.some(m => text.includes(m));
};

// Repairs a truncated tail: a model that hits its token limit often stops
// mid-tag ("<svg ... stroke=\"") — an unterminated START TAG or attribute quote
// that balanceHtml can't fix and that swallows all following markup. This drops
// any dangling partial tag / unterminated attribute at the very end.
const stripPartialTail = (html) => {
  if (!html) return html;
  let h = html;
  for (let i = 0; i < 4; i++) {
    const lastLt = h.lastIndexOf('<');
    if (lastLt === -1) break;
    const tail = h.slice(lastLt);
    const hasClose = tail.includes('>');
    const quotes = (tail.match(/"/g) || []).length;
    // Partial tag (no '>') OR a tag with an unterminated attribute quote (odd count).
    if (!hasClose || (hasClose && quotes % 2 === 1)) {
      h = h.slice(0, lastLt).trimEnd();
      continue;
    }
    break;
  }
  return h;
};

// Apply a set of {find, replace} edits to an HTML string. Tries an exact match
// first, then a whitespace-flexible match (LLMs often get whitespace slightly
// wrong). Uses function replacers so `$` sequences in the replacement are literal.
const applyEdits = (html, edits) => {
  let out = html;
  let applied = 0;
  for (const e of (edits || [])) {
    if (!e || typeof e.find !== 'string' || typeof e.replace !== 'string' || !e.find.trim()) continue;
    if (out.includes(e.find)) {
      out = out.replace(e.find, () => e.replace);
      applied++;
      continue;
    }
    if (e.find.length <= 600) {
      try {
        const flexible = new RegExp(e.find.trim().split(/\s+/).map(escapeRegExp).join('\\s+'));
        const m = out.match(flexible);
        if (m) { out = out.replace(m[0], () => e.replace); applied++; }
      } catch (err) { /* bad regex — skip */ }
    }
  }
  return { html: out, applied };
};

// ============================================================================
// LLM CALL WITH RETRY + JSON EXTRACTION
// ============================================================================

const runAgentWithRetry = async (basePrompt, opts, retries = 1) => {
  let prompt = basePrompt;
  for (let i = 0; i <= retries; i++) {
    const raw = await callLlm(prompt, opts, 2);
    const parsed = extractJsonRobust(raw);
    if (parsed) return parsed;
    
    console.warn(`[ai] JSON extraction failed on attempt ${i + 1}. Repairing...`);
    if (raw) {
      console.error(`[ai] RAW (first 300):\n${raw.substring(0, 300)}`);
    } else {
      console.error(`[ai] RAW: null`);
    }

    if (i < retries) {
      await sleep(1000);
      prompt = `${basePrompt}\n\nCRITICAL: Your previous response was NOT valid JSON. Output ONLY raw JSON starting with { or [. NO markdown, NO explanations, NO <think> tags.`;
    }
  }
  return null;
};

// ============================================================================
// TIMING UTILITY
// ============================================================================

const measureExecution = async (name, fn, metricsObj) => {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    metricsObj[name] = `${duration}s`;
    console.log(`[ai] ✅ ${name} completed in ${duration}s`);
    return result;
  } catch (err) {
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    metricsObj[name] = `${duration}s (FAILED)`;
    console.error(`[ai] ❌ ${name} failed after ${duration}s:`, err.message);
    throw err;
  }
};

// ============================================================================
// PHASE 1A: STRATEGY + DESIGN AGENT (Deep thinking about business + survey)
// ============================================================================

const strategyDesignAgent = async (contextStr, surveyAnswers, onProgress) => {
  if (onProgress) onProgress({ status: 'Phase 1', message: '🧠 Deep-analyzing business & designing premium UI...', progress: 5 });
  
  const prompt = `You are a world-class Product Strategist AND UI/UX Designer working together to create a PREMIUM, award-winning website.

=== BUSINESS CONTEXT ===
${contextStr}

=== CLIENT SURVEY ANSWERS (These are CRITICAL — the client personally chose these preferences) ===
${surveyAnswers}

=== YOUR MISSION ===
Study the business context AND the client's survey answers deeply. The survey reveals EXACTLY what design style, animations, layout, and brand personality the client wants. Translate these into ONE concrete, internally-consistent design system that every downstream builder will follow verbatim.

=== NON-NEGOTIABLE COLOR & CONTRAST RULES (a website that fails these is unusable) ===
1. Pick ONE coherent scheme — either a dark theme (dark background + light text) OR a light theme (light background + dark text). Never mix.
2. \`textPrimary\` MUST have a contrast ratio ≥ 7:1 against \`background\`. \`textSecondary\` MUST be ≥ 4.5:1 against \`background\`. If in doubt, make text lighter (dark theme) or darker (light theme).
3. \`surface\` must be visibly distinct from \`background\` (cards must be seen) but must NOT be so close to the text color that text on a surface becomes unreadable.
4. \`primary\` and \`accent\` are for buttons, highlights and CTAs — they must POP against the background, never be used as large text-on-background body copy.
5. Return real, valid 6-digit hex codes only.

Return a single JSON object (no extra keys, no prose):
{
  "targetAudience": "Specific demographic based on business type",
  "conversionObjective": "The #1 goal from survey",
  "brandPersonality": "Derived from survey Brand Persona answer",
  "primaryCta": "Specific CTA text tailored to this business (e.g. 'Book a Free Consultation')",
  "secondaryCta": "A secondary action (e.g. 'Call Us Now')",
  "designLanguage": "2-3 sentence EXACT visual style from survey — name the mood, the shapes, the density",
  "colorPalette": {
    "background": "#hex (page background)",
    "surface": "#hex (cards / raised panels — distinct from background)",
    "primary": "#hex (main brand / buttons)",
    "accent": "#hex (secondary highlight)",
    "textPrimary": "#hex (headings & key copy — high contrast on background)",
    "textSecondary": "#hex (muted body copy — still ≥4.5:1 on background)"
  },
  "typography": {
    "heading": "Google Font name (a real font that exists on Google Fonts)",
    "body": "Google Font name (a real, highly-readable font)"
  },
  "visualEffects": "Specific, tasteful CSS effects tied to the survey (e.g. 'subtle glassmorphism on cards, soft radial glow behind hero headline, 300ms hover lifts'). Keep it restrained and premium — no chaotic effects.",
  "layoutStyle": "Layout approach from survey (e.g. 'generous whitespace, alternating left/right feature rows, centered hero')",
  "styleTokens": {
    "aesthetic": "One phrase capturing the chosen 'Visual Aesthetic' (e.g. 'luxury & elegant').",
    "surfaceStyle": "EXACTLY one of: glass | solid-shadow | flat-bordered | soft — mapped from the 'Card & Surface Style' answer.",
    "gradientUsage": "EXACTLY one of: rich | subtle | none — mapped from the 'Gradients' answer.",
    "effects": "EXACTLY one of: glow | depth | texture | flat — mapped from the 'Special Effects' answer.",
    "borderRadius": "A Tailwind radius class mapped from 'Corner Style': very rounded→rounded-3xl, slightly rounded→rounded-xl, sharp→rounded-none, pill→rounded-full.",
    "density": "EXACTLY one of: airy | balanced | compact — mapped from 'Spacing & Density'. (airy→py-28, balanced→py-20, compact→py-14)",
    "animationStyle": "EXACTLY one of: dramatic | subtle | playful | none — mapped from the 'Animations' answer.",
    "typographyStyle": "EXACTLY one of: sans | serif | display | mono — mapped from 'Typography Personality'. Pick Google Fonts above that match this.",
    "heroStyle": "EXACTLY one of: bg-photo | split | centered | gradient — mapped from the 'Hero Section Style' answer."
  }
}

Map every styleTokens value STRICTLY from the client's survey answers above — do not invent preferences the client did not choose.`;
  
  return (await runAgentWithRetry(prompt, { 
    maxTokens: 1500, 
    timeout: PIPELINE_CONFIG.timeouts.planning, 
    temperature: 0.6, 
    model: PIPELINE_CONFIG.models.reasoning 
  })) || {
    colorPalette: { background: "#0a0a0a", surface: "#1a1a2e", primary: "#6C63FF", accent: "#F59E0B", textPrimary: "#ffffff", textSecondary: "#94a3b8" },
    typography: { heading: "Inter", body: "Inter" },
    visualEffects: "glassmorphism, hover:scale-105, backdrop-blur",
    layoutStyle: "Alternating full-width sections",
    styleTokens: {
      aesthetic: "modern & clean", surfaceStyle: "glass", gradientUsage: "subtle",
      effects: "depth", borderRadius: "rounded-2xl", density: "balanced",
      animationStyle: "subtle", typographyStyle: "sans", heroStyle: "split"
    }
  };
};

// ============================================================================
// PHASE 1B: ARCHITECT AGENT (Detailed per-section specifications)
// ============================================================================

const architectAgent = async (strategyDesign, contextStr, onProgress) => {
  if (onProgress) onProgress({ status: 'Phase 1', message: '🏗️ Architecting sections in detail...', progress: 12 });
  
  const prompt = `You are an award-winning Creative Director + UX strategist. The navbar, hero and footer are already built by the system. YOUR job is to invent the UNIQUE MIDDLE of THIS specific business's website so it feels custom-designed for them — NOT a generic template.

=== STRATEGY & DESIGN SYSTEM ===
${JSON.stringify(strategyDesign, null, 2)}

=== BUSINESS CONTEXT ===
${contextStr}

=== YOUR TASK: design 2 or 3 BESPOKE middle sections ===
Think hard about what THIS business actually sells and how a real customer decides to buy from them. Then design sections that speak to THAT — with specific, on-brand names and content. Be creative and concrete.

CRITICAL — AVOID GENERIC:
- Do NOT title sections with bland words like "Services", "Gallery", "About Us", "How It Works", "Features". Those are boring and templated.
- Instead invent SPECIFIC, benefit-driven names for THIS business. Examples of the RIGHT level of specificity:
  • A custom T-shirt / DTF printing shop → "From Your Design to Doorstep" (process), "Fabrics, Fits & Print Types" (product options grid), "Bulk Order Pricing" (pricing tiers), "Printed for Teams & Brands" (portfolio showcase), "Get Your Custom Quote" (cta).
  • A dental clinic → "Treatments We Specialise In", "Your First Visit, Step by Step", "Meet Your Care Team", "Smiles We've Transformed" (gallery).
  • A cafe → "What's Brewing" (menu), "Our Story in the Cup", "Weekend Live Music" (offers/events).
- Every section name and its copy must reference the business's real category, products, city, and reviews.

Each section reuses ONE proven LAYOUT TYPE (this is the visual skeleton — the creativity is in the NAME, COPY and DATA, not exotic layouts):
features | gallery | stats | process | offers | pricing | faq | menu | showcase | map-hours | cta-banner | team
Pick the 2-3 types that best fit this business and do NOT repeat a type.

MANDATORY — one of your sections MUST showcase the business's ACTUAL things-for-sale with REAL item names, realistic prices, and (where possible) real photos:
- For food/restaurant/cafe/bakery → type "menu" titled like "Our Menu" / "Signature Dishes" (real dish names + prices).
- For retail/shop/clothing/electronics/etc → type "showcase" titled like "Our Collection" / "Shop Our Range" (real product names + prices + photos), and each product has an Add-to-Cart action.
- Invent plausible, specific items from the business's category if exact products aren't in the data (e.g. a Maharashtrian restaurant → "Misal Pav ₹80", "Thali ₹150"; an electronics shop → "Sony 55\\" 4K TV ₹52,999"). Never leave items blank or generic.

=== LAYOUT SAFETY LAW (every description MUST respect this) ===
- Each section is a self-contained vertical band in normal document flow — never positioned relative to another section.
- No section is full-screen height. Sections size to their content.
- Decorative background blobs/gradients are layers BEHIND content, never over readable text.
- Every multi-item layout is a RESPONSIVE grid that collapses to ONE column on mobile.
- Sections are SUBSTANTIAL (heading + main content + optional CTA), rich via CONTENT not risky positioning.

For EACH section provide:
- "id": short unique lowercase slug (e.g. "print-process", "fabric-options", "bulk-pricing")
- "tag": "section"
- "type": one of the layout types above
- "title": the ACTUAL specific heading shown on the page (e.g. "From Your Design to Doorstep") — NOT a generic word
- "navLabel": a SHORT 1-2 word nav-menu label for this section (e.g. "Process", "Fabrics", "Pricing") — specific, not "Section"
- "animation": a specific scroll/hover animation that fits the client's animation style
- "interactive": a concrete interactive behavior via the global helpers (data-book / data-save / data-accordion / data-lightbox / data-count)
- "description": 4-6 rich sentences of the EXACT copy/content, layout and animation — all specific to THIS business (real product names, real numbers, real city).

Return ONLY this JSON:
{
  "dynamicSections": [
    { "id": "print-process", "tag": "section", "type": "process", "title": "From Your Design to Doorstep", "navLabel": "Process", "animation": "...", "interactive": "...", "description": "..." }
    /* 2 or 3 total, each a DIFFERENT type, each with a specific non-generic title */
  ],
  "globalCss": "Optional extra @keyframes/utility classes as a CSS string. The base template already provides fadeInUp, float, glass, glow — return \\"\\" if nothing extra is needed.",
  "googleFonts": ["HeadingFont", "BodyFont"]
}

Output ONLY the JSON.`;

  const result = await runAgentWithRetry(prompt, {
    maxTokens: 2500,
    timeout: PIPELINE_CONFIG.timeouts.planning,
    temperature: 0.7,
    model: PIPELINE_CONFIG.models.reasoning
  });

  // Normalize + guardrail: ensure 2-3 valid dynamic sections.
  let dynamicSections = (result && Array.isArray(result.dynamicSections)) ? result.dynamicSections : null;
  if (!dynamicSections || dynamicSections.length === 0) {
    dynamicSections = [
      { id: 'services', tag: 'section', type: 'features', title: 'What We Offer', navLabel: 'Services', animation: 'cards stagger-fade up on scroll, lift on hover', interactive: 'each card links to the contact CTA', description: 'A responsive grid of the core services with icon, title and a rich description each, plus a closing call-to-action.' },
      { id: 'gallery', tag: 'section', type: 'gallery', title: 'Our Work', navLabel: 'Gallery', animation: 'images zoom softly on hover', interactive: 'clicking an image opens it larger in a lightbox overlay', description: 'An immersive responsive photo grid using the real business photos with hover zoom.' },
    ];
  }
  dynamicSections = dynamicSections.slice(0, 3).map((s, i) => {
    const id = (s.id || `section-${i + 1}`).toString().toLowerCase().replace(/[^a-z0-9-]/g, '-') || `section-${i + 1}`;
    return {
      id,
      tag: 'section',
      type: s.type || 'features',
      title: (s.title || '').toString().trim(),
      navLabel: (s.navLabel || '').toString().trim().slice(0, 18),
      animation: s.animation || '',
      interactive: s.interactive || '',
      description: s.description || `A well-designed ${s.type || 'content'} section for this business.`,
    };
  });

  return {
    dynamicSections,
    globalCss: (result && result.globalCss) || '',
    googleFonts: (result && result.googleFonts) || [strategyDesign.typography?.heading || 'Inter', strategyDesign.typography?.body || 'Inter'],
  };
};

// ============================================================================
// PHASE 2: PER-SECTION DEVELOPER (One LLM call per section)
// ============================================================================

const buildSingleSection = async (component, strategyDesign, contextStr, completedSections, onProgress, sectionIdx, totalSections) => {
  const progressBase = 18 + Math.round((sectionIdx / totalSections) * 55);
  if (onProgress) {
    onProgress({ 
      status: `Section ${sectionIdx + 1}/${totalSections}`, 
      message: `💻 Building ${component.id}...`, 
      progress: progressBase 
    });
  }

  // Build a brief summary of what's already been built for continuity
  const completedSummary = completedSections.length > 0 
    ? completedSections.map(s => `- "${s.id}": Already built (${s.html.length} chars)`).join('\n')
    : '(This is the first section)';

  const tag = component.tag || 'section';

  // Resolve the client's survey-driven style tokens into explicit, unambiguous
  // build instructions so their choices actually shape the output.
  const t = strategyDesign.styleTokens || {};
  const radius = t.borderRadius || 'rounded-2xl';
  const densityPad = t.density === 'airy' ? 'py-28 md:py-32' : t.density === 'compact' ? 'py-14 md:py-16' : 'py-20 md:py-28';

  // Detect light vs dark theme from the chosen background so glass/borders/tints
  // are visible on EITHER theme (white overlays are invisible on light sites).
  const isLight = isLightHex(strategyDesign.colorPalette?.background || '#0a0a0a');
  const tint = isLight ? 'black' : 'white';          // overlay/border tint that stays visible
  const themeNote = isLight
    ? 'This is a LIGHT theme: use dark text on light surfaces; for glass/overlays use black/5–black/10 tints and border-black/10; NEVER use white text on light backgrounds.'
    : 'This is a DARK theme: use light text on dark surfaces; for glass/overlays use white/5–white/10 tints and border-white/10; NEVER use dark text on dark backgrounds.';

  const surfaceRecipe = {
    glass: `glassmorphism cards: "bg-${tint}/5 backdrop-blur-lg border border-${tint}/10 ${radius}"`,
    'solid-shadow': `solid raised cards: "bg-surface shadow-2xl border border-${tint}/5 ${radius}"`,
    'flat-bordered': `flat bordered cards: "bg-transparent border-2 border-${tint}/15 ${radius}" (NO shadows)`,
    soft: `soft pillowy cards: "bg-surface/60 shadow-lg ${radius}"`,
  }[t.surfaceStyle] || `cards: "bg-${tint}/5 backdrop-blur-lg border border-${tint}/10 ${radius}"`;
  const gradientRule = {
    rich: 'USE rich, colorful gradients on backgrounds, buttons and headings (bg-gradient-to-br / text-transparent bg-clip-text).',
    subtle: 'USE gradients sparingly — a few tasteful accent touches only.',
    none: 'Do NOT use gradients — solid colors only.',
  }[t.gradientUsage] || 'Use gradients sparingly as tasteful accents.';
  const effectRule = {
    glow: 'Add soft glows/neon halos to key buttons and accents (use the .glow class + colored shadows).',
    depth: 'Use strong drop-shadows and layered depth (shadow-2xl, stacked panels).',
    texture: 'Add a subtle decorative textured/mesh background layer behind content (absolute -z-10, low opacity).',
    flat: 'Keep it clean and flat — minimal shadows, no glows.',
  }[t.effects] || 'Use tasteful shadows for depth.';
  const animRule = {
    dramatic: 'Rich motion: cards/elements use hover:-translate-y-2 hover:scale-[1.03]; add animate-float on decorative layers.',
    subtle: 'Gentle motion only: hover:-translate-y-1 with soft transitions.',
    playful: 'Bouncy, springy hovers: hover:-translate-y-1.5 hover:scale-105 with duration-200 ease-out.',
    none: 'No hover motion or animation — keep everything static.',
  }[t.animationStyle] || 'Gentle hover motion.';

  const styleDirectives = `=== CLIENT'S DESIGN CHOICES — HONOR THESE EXACTLY (from their survey) ===
• Theme: ${themeNote}
• Aesthetic: ${t.aesthetic || 'modern & clean'}
• Corners/Radius: use "${radius}" on cards, buttons, images.
• Section vertical padding: use "${densityPad}" on the inner container (spacing/density choice).
• Card/surface treatment: ${surfaceRecipe}
• Gradients: ${gradientRule}
• Effects: ${effectRule}
• Animation: ${animRule}
• Hero style preference: ${t.heroStyle || 'split'} (applies to the hero section).`;

  // Role hint by section id (hero/reviews are fixed) OR by dynamic section type.
  const heroStyleHint = {
    'bg-photo': 'Use Photo 1 as a full-bleed BACKGROUND layer (absolute inset-0 -z-10, object-cover) with a dark/tinted gradient overlay on top so the headline stays readable. Headline + buttons sit centered or bottom-left over it.',
    split: 'Two-column split: headline + subcopy + buttons + trust pills on the left; Photo 1 in a rounded aspect-box on the right (stacks to one column on mobile).',
    centered: 'Centered, minimal hero: everything center-aligned on the background with a soft decorative glow behind the headline. Photo 1 optional as a small framed image below the buttons.',
    gradient: 'A rich gradient/mesh backdrop (decorative -z-10 layer) behind a centered headline + buttons. Photo 1 optional as a framed image.',
  }[t.heroStyle] || 'Two-column split: text left, Photo 1 right (stacks on mobile).';

  const roleHints = {
    hero: `HERO-SPECIFIC (this section is CONSISTENT on every site — it MUST be fully visible on first load without scrolling):
- Root: <section id="hero" class="relative w-full min-h-[calc(100vh-64px)] flex items-center overflow-hidden">. The min-h-[calc(100vh-64px)] makes it fill exactly ONE screen below the 64-68px fixed navbar.
- Do NOT add large top padding (no pt-28/pt-32). The inner container is just "py-6". Vertical centering ("flex items-center") + the min-height already clears the navbar and centers the content — extra top padding pushes the hero below the fold (the bug we are fixing).
- Keep the whole hero content SHORT enough to fit one screen: headline at most 3 lines. Use "text-4xl md:text-5xl lg:text-6xl" (only go 7xl for a very short headline). Subcopy 1-2 lines. Then the buttons + trust pills.
- Layout for THIS client (heroStyle=${t.heroStyle || 'split'}): ${heroStyleHint}
- TWO working buttons: PRIMARY = the main action for this business (see PRIMARY ACTION below), SECONDARY = <a href="#${(strategyDesign.__navHint || 'contact')}"> or scrolls to a real section.
- Show trust stats (rating ★, review count, "since" year) as small pills.`,
    reviews: `REVIEWS-SPECIFIC (this section is CONSISTENT but must stay COMPACT — smaller than other sections):
- Use REDUCED vertical padding "py-12 md:py-16" (override the density padding — reviews are intentionally compact).
- A tight heading (text-2xl md:text-3xl) then a responsive grid "grid grid-cols-1 md:grid-cols-3 gap-5" of the REAL customer reviews from the business context.
- Each card is COMPACT: star row (★★★★★), a SHORT quoted review (trim to ~140 chars), reviewer name. Small cards, not oversized.
- Never invent fake reviews — use the quotes provided. If fewer than 3 exist, show what exists.`,
  };

  const placeholderNote = `If an item has no REAL photo URL, render a compact branded placeholder tile (centered <i data-lucide> icon on a bg-${tint}/5 box of the same aspect ratio) — NEVER a big empty box.`;
  const typeHints = {
    features: `Heading block (eyebrow + title + one-line intro), then a responsive grid "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" of 3-6 service/feature cards. Each card is "h-full flex flex-col": icon chip via <i data-lucide="..."></i>, bold title, 2-3 line real description. Equal heights, no fixed text heights.`,
    gallery: `Heading block, then a responsive image grid "grid grid-cols-2 md:grid-cols-3 gap-4". Each image in an aspect-box (aspect-square) "overflow-hidden ${radius}", image "w-full h-full object-cover group-hover:scale-110 transition-transform duration-500". Use the REAL Photo URLs (Photo 2..Photo 8) — only render as many tiles as you have real photos. Add data-lightbox to each image. ${placeholderNote}`,
    stats: `A responsive row "grid grid-cols-2 md:grid-cols-4 gap-6" of 3-4 stat tiles (each "h-full flex flex-col items-center"). Each tile: a big number with attribute data-count="NUMBER" (animated count-up on scroll) and a label. Pull real numbers (years since founding, review count, rating).`,
    process: `Heading block, then a numbered step layout "grid grid-cols-1 md:grid-cols-3 gap-8" (each step "h-full flex flex-col"). Each step: a numbered badge, title, description. 3-4 steps describing how the business serves customers.`,
    offers: `Heading block, then a responsive grid "grid grid-cols-1 md:grid-cols-3 gap-6" of 2-3 promotional deal cards (each "h-full flex flex-col"). Each card: the offer + a "Claim Offer" button with attribute data-save="offer:UNIQUE_ID" pushed to the bottom (mt-auto). Real, plausible offers.`,
    pricing: `Heading block, then a responsive grid "grid grid-cols-1 md:grid-cols-3 gap-6" of 2-3 pricing/package cards, each "h-full flex flex-col" with the data-book CTA at the bottom (mt-auto): name, price, feature list. Optionally highlight the middle plan. All cards equal height.`,
    faq: `Heading block, then an accordion list of 4-6 Q&As in a "max-w-3xl mx-auto" column. Each item: a <button data-accordion class="w-full text-left"> with the question and a hidden answer panel below it (class "hidden") that toggles open on click. Real questions for this business.`,
    menu: `Heading block, then a real menu/catalog: 1-2 category groups, each a list of 4-8 REAL items ("flex justify-between items-center gap-4") with dish/product name, a short description, and a price (₹). Use real, specific item names for this cuisine/business — never "Item 1". Responsive two-column on desktop, one on mobile, compact rows. ${primaryAction === 'cart' ? 'Each row ends with a small Add-to-Cart button (see PRIMARY ACTION).' : 'Optionally a small data-book "Order / Reserve" button per row.'}`,
    showcase: `Heading block, then a responsive grid "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" of 4-8 COMPACT product cards with REAL product names + realistic ₹ prices for this business. Each card is "h-full flex flex-col ${radius} overflow-hidden": an aspect-square image tile (real Photo URL if available, else a branded icon tile), then padding with product name, ONE short spec line, price, and — pushed to the bottom with mt-auto — the action button: ${primaryAction === 'cart' ? 'an Add-to-Cart button (<button data-cart-add data-name="..." data-price="₹..." data-image="URL">Add to Cart</button>).' : 'a data-book "Enquire / Order" button.'} Equal heights, tidy, NO large empty areas. ${placeholderNote}`,
    'map-hours': `Two-column responsive layout "grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch": left = opening hours list + a data-book/call CTA + a "Get Directions" link to https://maps.google.com/?q=...; right = a styled location card (address). No external iframe.`,
    'cta-banner': `A single bold call-to-action strip (NOT a grid): a short punchy headline, one line of subcopy, and a prominent data-book button plus a tel: call button. Use the primary/accent colors as a gradient or solid band. Centered, compact vertical padding.`,
    team: `Heading block, then a responsive grid "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" of people/expertise cards (each "h-full flex flex-col items-center text-center"): avatar circle or icon, name/role, one-line bio. ${placeholderNote}`,
  };

  // Category-appropriate primary action (shop cart vs booking) — drives the
  // hero CTA and product-card buttons so shops get real "Add to Cart" and
  // hospitality/services get "Reserve/Book".
  const primaryAction = strategyDesign.primaryAction || 'booking';
  const commerceId = strategyDesign.__commerceId || 'products';
  const primaryActionBlock = primaryAction === 'cart'
    ? `=== PRIMARY ACTION FOR THIS BUSINESS = SHOP / CART (make buying fully work) ===
- Product / item cards MUST include a working Add-to-Cart button:
  <button data-cart-add data-name="EXACT PRODUCT NAME" data-price="₹PRICE" data-image="REAL_PHOTO_URL_OR_OMIT" class="...">Add to Cart</button>
  The page's global runtime stores the cart in localStorage, shows a floating cart with a live count, and a checkout that saves the order — you do NOT build any of that, just add the buttons.
- The HERO primary button must be <a href="#${commerceId}" ...>Shop Now</a> (scrolls to the products). A secondary button may use data-book to "Enquire".
- Never use a generic "Get a Quote" as the main action for a shop.`
    : `=== PRIMARY ACTION FOR THIS BUSINESS = BOOKING / RESERVATION ===
- The hero primary button and any card CTA use  data-book  (opens the reservation modal). Use a SPECIFIC label that fits: "Reserve a Table" (restaurant), "Book a Room" (hotel), "Book Appointment" (clinic / salon / service). Never a generic "Get a Quote".`;

  let roleHint = roleHints[component.id];
  if (!roleHint) {
    const typeHint = typeHints[component.type] || `Heading block + rich, well-spaced content in a responsive layout for a "${component.type || 'content'}" section.`;
    roleHint = `SECTION TYPE = ${component.type || 'content'}:\n- ${typeHint}\n${component.animation ? `- Animation to implement: ${component.animation}` : ''}\n${component.interactive ? `- Interactive behavior (make it REALLY work via localStorage/JS): ${component.interactive}` : ''}`;
  }

  const prompt = `You are a WORLD-CLASS Frontend Developer building ONE section of a premium website with Tailwind CSS (loaded via CDN). You will output ONLY the HTML for this single section. It will be stacked vertically with the other sections, so it MUST be perfectly self-contained.

=== BUSINESS CONTEXT ===
${contextStr}

=== DESIGN SYSTEM (use these EXACT hex colors, fonts and effects) ===
${JSON.stringify(strategyDesign, null, 2)}

=== SECTION TO BUILD ===
ID: "${component.id}"   Root tag: <${tag}>${component.type ? `   Type: ${component.type}` : ''}${component.title ? `\nHeading (use THIS exact, specific heading — do not replace it with a generic word): "${component.title}"` : ''}
Specification: ${component.description}${component.animation ? `\nAnimation intent: ${component.animation}` : ''}${component.interactive ? `\nRequired interactive behavior: ${component.interactive}` : ''}

${styleDirectives}

${primaryActionBlock}

=== ALREADY COMPLETED SECTIONS (for visual continuity) ===
${completedSummary}

════════════════════════════════════════════════════════════
 STRUCTURAL CONTRACT — violating ANY rule breaks the whole page
════════════════════════════════════════════════════════════
1. ROOT: Output exactly ONE root element: <${tag} id="${component.id}" class="relative w-full ...">. Open it once, CLOSE it once with </${tag}>. Every tag you open MUST be closed. Never leave a dangling <div>.
2. CONTAINER: Put ALL visible content inside ONE inner wrapper:
   <div class="max-w-7xl mx-auto px-6 md:px-8 ${component.id === 'header' ? 'py-4' : component.id === 'hero' ? 'py-6' : densityPad}"> ... </div>
   This guarantees consistent gutters and vertical rhythm across every section. (The hero uses compact padding — its height comes from min-h + centering, NOT from big padding.)
3. FORBIDDEN (these are what cause overlapping/broken layouts — do NOT use them on content):
   • position:absolute / fixed / sticky on CONTENT elements (only the header may be fixed).
   • negative margins (-mt-*, -ml-*, -mb-*) to pull elements around.
   • h-screen / 100vh / fixed pixel heights on any text container.
   • overflow-hidden on a container that holds text you need to remain visible (it will clip your copy — the "Premium Product Range" bug).
4. DECORATIVE LAYERS: A background blob/gradient/glow is allowed ONLY as an absolutely-positioned layer that sits BEHIND content: <div class="absolute inset-0 -z-10 pointer-events-none ...">. It must never cover readable text.
5. RESPONSIVE: Every multi-item layout is a responsive grid that collapses to ONE column on mobile — "grid grid-cols-1 md:grid-cols-3 gap-6". Never fixed-width columns, never a horizontal row that can't wrap.
6. TEXT: Text containers must be free to grow — no fixed heights, no unintended truncate/line-clamp. Ensure strong contrast: text on \`background\` uses textPrimary/textSecondary; text on a colored/primary surface uses white.
7. IMAGES: Use ONLY the real Photo URLs from the context above (never placeholder.com / unsplash / a literal "Photo 1"). Every <img> must be inside an aspect-box and written as:
   <img src="REAL_URL" alt="..." loading="lazy" class="w-full h-full object-cover" onerror="this.style.display='none'">
8. ANIMATIONS: Interactive cards/buttons get "transition-all duration-300 hover:-translate-y-1 hover:shadow-xl". Decorative layers may use the "animate-float" class. (The section auto-fades in on scroll — you don't add that.)
9. FUNCTIONALITY — use these GLOBAL helpers (already defined on the page, no dead buttons ever):
   • Book/appointment/quote button: add the attribute  data-book  (e.g. <button data-book ...>). It opens the centered booking modal. Do NOT write your own modal.
   • Save / like / claim / wishlist: add  data-save="unique-key"  → persists to localStorage and shows a toast automatically.
   • Any form: add  data-store="form-name"  to the <form>. Its fields are saved to localStorage and a success toast shows (submission is auto-prevented). Do NOT write onsubmit yourself.
   • FAQ toggle: a <button data-accordion> followed by a sibling panel (class "hidden") — global JS toggles it.
   • Animated counter: <span data-count="1200">0</span> counts up on scroll.
   • Image lightbox: add  data-lightbox  to an <img> to open it enlarged on click.
   • Scroll link: href="#realSectionId" (smooth scroll wired globally) — never a dead href="#".
   • Phone: <a href="tel:PHONE">. Address: <a href="https://maps.google.com/?q=..." target="_blank">.
   You may still use inline onclick with localStorage for anything custom — but PREFER the data-* helpers above.
10. STYLE: Premium and tasteful — honor the client's chosen surface/effect/gradient tokens above, "${radius}" corners. Restrained, not chaotic.
11. GRID & CARD DISCIPLINE (this is what prevents squeezed/stretched cards and giant empty holders):
   • Multi-item sections use a CONSISTENT responsive grid — e.g. products/showcase: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"; features/pricing/reviews: "grid grid-cols-1 md:grid-cols-3 gap-6". NEVER place a single item full-width in a multi-item section.
   • EVERY card in a grid MUST be equal height: put "h-full flex flex-col" on each card, and push its button to the bottom with "mt-auto". Cards in a row must never be different heights.
   • Image tiles use a FIXED aspect ratio ("aspect-square" or "aspect-[4/3]") and never exceed "h-56". Never leave a large empty image area.
   • If you do NOT have a REAL photo URL for an item, do NOT output an empty <img> or blank box. Instead render a compact branded placeholder tile of the same aspect ratio: a centered <i data-lucide="..."></i> icon on a "bg-${tint}/5" background. Keep it small and tidy.
   • Keep product/showcase cards COMPACT: image/tile → name → 1 short spec line → price → small CTA button. No oversized paddings that create dead space.
12. ICONS & NO CUSTOM CODE (this is what prevents mid-tag truncation & broken layouts):
   • ICONS: use Lucide ONLY — <i data-lucide="tv"></i>, <i data-lucide="refrigerator"></i>, <i data-lucide="check"></i>, etc. (the library is already loaded and renders them). NEVER hand-write <svg>…<path> markup — long inline SVG paths blow the token budget and get cut off mid-tag, which destroys the page.
   • NO <script> tags inside your section — ALL interactivity is provided globally (data-book, data-save, data-accordion, data-lightbox, data-count, forms). Any <script> you write will be stripped.
   • NO <style> tags and NO custom CSS classes (no .my-grid, .reveal-up, etc.) — use Tailwind utility classes directly for grids (grid grid-cols-1 md:grid-cols-3) and everything else. Custom classes won't exist and will render unstyled.
   • Only use color classes from this set (they are configured): primary, accent, brand, surface, background, textPrimary, textSecondary (e.g. text-primary, bg-surface, text-textSecondary, from-primary, to-accent). Do NOT invent other color names.
   • Keep the whole section lean so it is NEVER truncated — favor Lucide icons and Tailwind utilities over verbose markup.
13. PIXEL-PERFECT POLISH (the details that separate a clean site from a sloppy one — follow ALL):
   • ONE class per property — never emit conflicting/duplicate utilities (e.g. NOT "min-h-[90vh] min-h-[calc(100vh-4rem)]"; pick one). No repeated padding/height/color utilities on the same element.
   • Icon chips: the coloured square that holds an icon is a FIXED size with "shrink-0" and centers a SMALLER icon — e.g. <div class="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"><i data-lucide="tv" class="w-5 h-5 text-white"></i></div>. The icon is always smaller than its chip.
   • Inline check/bullet icons in lists get "shrink-0" so wrapping text never squishes them: <i data-lucide="check" class="w-4 h-4 text-primary shrink-0"></i>.
   • Pills/badges/price-tags inside a flex-col column must use "self-start" (or "w-fit") so they hug their content instead of stretching full-width.
   • Consistent spacing rhythm: use a steady scale (gap-3, mb-4, mb-6, p-6). Don't mix wildly different paddings between sibling cards.
   • <cite> and testimonials: add "not-italic" (cite is italic by default). Reviewer name small and muted.
   • Only render as many image tiles as you have REAL photo URLs — never pad a gallery/showcase with empty boxes to "fill the grid".
   • Text must never be clipped: no fixed heights on text blocks, no unintended truncate/line-clamp, no overflow-hidden on a box that holds copy.
   • Buttons and cards have smooth, subtle transitions ("transition-all duration-300 hover:-translate-y-1") — consistent across the section, not random.

=== GOLD-STANDARD CARD (match THIS structure & quality — equal height, shrink-0 icons, self-start badge, mt-auto CTA) ===
<article class="group bg-surface rounded-2xl border border-white/5 shadow-2xl overflow-hidden flex flex-col h-full transition-all duration-300 hover:-translate-y-1">
  <div class="aspect-[4/3] overflow-hidden">
    <img src="REAL_PHOTO_URL" alt="..." loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" onerror="this.style.display='none'">
  </div>
  <div class="p-6 flex flex-col flex-1">
    <div class="flex items-center gap-3 mb-4">
      <div class="w-11 h-11 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0"><i data-lucide="tv" class="w-5 h-5 text-white"></i></div>
      <h3 class="font-heading text-lg font-bold text-textPrimary">Product Name</h3>
    </div>
    <span class="inline-flex self-start items-center px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-medium mb-5">From ₹00,000</span>
    <ul class="space-y-2.5 mb-6 flex-1">
      <li class="flex items-center gap-2.5 text-sm text-textSecondary"><i data-lucide="check" class="w-4 h-4 text-primary shrink-0"></i>Real feature one</li>
    </ul>
    <button data-book class="mt-auto w-full py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-medium transition-all duration-300 hover:-translate-y-0.5">Request Quote</button>
  </div>
</article>

${roleHint}

=== OUTPUT FORMAT ===
Return ONLY the raw HTML for this one section. NO JSON, NO markdown fences, NO commentary.
Start with <${tag} id="${component.id}" and end with </${tag}>. Make sure the final closing tag is present.`;

  // Use callLlm directly since we are NOT parsing JSON anymore. This bypasses JSON truncation issues entirely.
  const rawHtml = await callLlm(prompt, {
    maxTokens: 8192,
    timeout: PIPELINE_CONFIG.timeouts.section,
    temperature: 0.3,
    model: PIPELINE_CONFIG.models.coder,
    expectJson: false,
    system: 'You are a senior front-end developer. Output ONLY the raw HTML for the requested section. Your entire response MUST start with "<" and be valid HTML — absolutely no analysis, planning, reasoning, notes, or commentary before or after the markup. Use Lucide icons (<i data-lucide="...">) — never hand-write <svg> paths. Do not include <script> or <style> tags.',
  });

  if (rawHtml) {
    // 1) strip fences + <think>, 2) slice out ONLY the real root element (drops
    // leaked reasoning prose), 3) remove inline <script>/<style> (global runtime
    // owns interactivity; these are the main truncation hazard), 4) repair any
    // truncated tail (unterminated tag/attribute), 5) BALANCE nesting.
    let cleanHtml = rawHtml
      .replace(/```html\s*/gi, '').replace(/```\s*$/gi, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim();
    cleanHtml = extractRootTag(cleanHtml, tag, component.id);
    cleanHtml = cleanHtml
      .replace(/<script[\s\S]*?<\/script>/gi, '')   // complete inline scripts
      .replace(/<script\b[\s\S]*$/gi, '')            // truncated trailing <script...
      .replace(/<style\b[^>]*>(?:(?!<\/style>)[\s\S])*$/gi, ''); // truncated trailing <style...
    cleanHtml = stripPartialTail(cleanHtml);
    cleanHtml = balanceHtml(cleanHtml);

    // Reject garbage: must contain the root tag and enough real markup.
    if (!cleanHtml || cleanHtml.length < 60 || !new RegExp(`<${tag}\\b`, 'i').test(cleanHtml)) {
      console.warn(`[ai] ⚠️ Section "${component.id}" produced no usable HTML (likely reasoning-only output).`);
      return null;
    }
    // Reject sections whose visible text is actually leaked reasoning/planning.
    if (looksLikeReasoning(cleanHtml)) {
      console.warn(`[ai] ⚠️ Section "${component.id}" contained leaked reasoning text — rejecting.`);
      return null;
    }
    return { id: component.id, html: cleanHtml };
  }

  console.warn(`[ai] ⚠️ Section "${component.id}" generation failed or returned empty.`);
  return null;
};

// ============================================================================
// PHASE 3: QA REVIEWER
// ============================================================================

const qaAgent = async (sections, strategyDesign, contextStr, onProgress, attemptNum) => {
  if (onProgress) onProgress({ status: 'QA Review', message: `🔍 Quality check ${attemptNum}...`, progress: 78 + (attemptNum - 1) * 8 });
  
  const sectionSummary = sections.map(s => `- ${s.id}: ${s.html.length} chars`).join('\n');
  // Show the HEAD and the TAIL of each section — truncation / unterminated tags /
  // unbalanced nesting always surface at the END, so a head-only preview misses them.
  const htmlPreview = sections.map(s => {
    const h = s.html || '';
    const body = h.length > 1300 ? `${h.substring(0, 700)}\n... [middle omitted] ...\n${h.slice(-500)}` : h;
    return `<!-- Section: ${s.id} (${h.length} chars) -->\n${body}`;
  }).join('\n\n');

  const prompt = `You are a STRICT Quality Assurance Director reviewing a website before it ships to the client. The navbar and footer are built by the system (always correct) — you are reviewing the HERO, the 2-3 dynamic middle sections, and the REVIEWS section.

=== DESIGN SYSTEM ===
${JSON.stringify(strategyDesign, null, 2)}

=== BUSINESS CONTEXT ===
${contextStr}

=== SECTIONS PRESENT ===
${sectionSummary}

=== HTML PREVIEW (head + tail of each section) ===
${htmlPreview}

=== REVIEW CHECKLIST (Score 1-10 each). Add a section id to failedSections for ANY score ≤ 6. ===
1. TRUNCATION / STRUCTURE (CRITICAL #1 failure): Does the section end cleanly on its own closing tag? Any sign it was cut off mid-tag/mid-attribute (e.g. a tag ending in "stroke=\\"" with no ">", an unterminated attribute, a dangling <svg/<div, or a <script that never closes)? Does it open exactly one root tag and close it? Any of these → score 1 and add to failedSections.
2. GRID & CARD DISCIPLINE (CRITICAL #2): In multi-item grids, is every card equal height ("h-full flex flex-col" + "mt-auto" CTA)? Any squeezed/stretched cards, a single item spanning full width, or a giant EMPTY image box / blank placeholder? → fail the section.
3. NO INLINE SVG/SCRIPT/STYLE: Icons must be Lucide (<i data-lucide>), not hand-written <svg><path>. No <script>/<style> tags, no custom CSS classes. Inline <svg> or <script> → fail.
4. CLEAN UTILITIES: No conflicting/duplicate utilities on one element (e.g. two min-h-*). Pills/badges use self-start (not stretched). Icons in chips/lists have shrink-0.
5. COLOR CLASSES: Only uses configured names (primary/accent/brand/surface/background/textPrimary/textSecondary). No invented color classes that would render unstyled.
6. READABILITY / CONTRAST: Text clearly readable, never clipped (no fixed-height text boxes, no unintended overflow-hidden/line-clamp).
7. RESPONSIVE: Multi-item layouts are responsive grids that collapse to one column on mobile.
8. COPYWRITING: Real, compelling copy for THIS business (no lorem ipsum, no "Product Name" placeholders left in).
9. IMAGES: Real /api/business/photo URLs with object-cover + onerror fallback; only as many tiles as there are real photos.
10. FUNCTIONALITY: Interactive elements use the global hooks (data-book / data-save / data-lightbox) or real href/tel — no dead href="#".

Return JSON:
{
  "passed": true/false (true ONLY if overall >= 8.5 AND no section has a truncation/structure or grid-discipline failure),
  "overallScore": 8.5,
  "failedSections": ["sectionId"],
  "feedback": "Specific, actionable fix per failed section (name the exact problem).",
  "criticalIssues": ["Any critical problems"]
}

Be STRICT. Truncated/unterminated markup = automatic FAIL. Empty image boxes or unequal card heights = FAIL. Inline <svg>/<script> = FAIL.`;
  
  return (await runAgentWithRetry(prompt, { 
    maxTokens: 1000, 
    timeout: PIPELINE_CONFIG.timeouts.qa, 
    temperature: 0.2, 
    model: PIPELINE_CONFIG.models.reasoning 
  })) || { passed: true, overallScore: 8.5, failedSections: [], feedback: "", criticalIssues: [] };
};

// ============================================================================
// DETERMINISTIC HEADER + FOOTER
// These are built in code (not by the LLM) so the navbar and footer are ALWAYS
// present, correctly styled, and their nav links always match the sections that
// actually exist. This is what guarantees "navbar/footer never missing".
// ============================================================================

const buildHeaderHtml = (biz, sd, navSections) => {
  const c = sd.colorPalette || {};
  const light = isLightHex(c.background);
  const tint = light ? 'black' : 'white';
  const radius = (sd.styleTokens && sd.styleTokens.borderRadius) || 'rounded-xl';
  const primary = c.primary || '#6C63FF';
  const textPrimary = c.textPrimary || (light ? '#0f172a' : '#ffffff');
  const bg = c.background || (light ? '#ffffff' : '#0a0a0a');
  const cta = esc(sd.primaryCta || (sd.primaryAction === 'cart' ? 'Shop Now' : 'Book Now'));
  // Shops → the CTA scrolls to the products section; everyone else opens the booking modal.
  const ctaAttrs = (sd.primaryAction === 'cart' && sd.__commerceId)
    ? `href="#${sd.__commerceId}"`
    : `type="button" data-book`;
  const CtaTag = (sd.primaryAction === 'cart' && sd.__commerceId) ? 'a' : 'button';

  const links = navSections.map(s => `<a href="#${s.id}" class="text-sm font-medium opacity-80 hover:opacity-100 transition-opacity">${esc(s.label)}</a>`).join('\n');
  const mobileLinks = navSections.map(s => `<a href="#${s.id}" data-close-menu class="block px-4 py-2.5 text-sm opacity-80 hover:opacity-100">${esc(s.label)}</a>`).join('\n');
  const phoneBtn = biz.phone
    ? `<a href="tel:${esc(biz.phone)}" class="hidden lg:inline-flex items-center gap-2 text-sm font-semibold" style="color:${textPrimary}"><i data-lucide="phone" class="w-4 h-4"></i>${esc(biz.phone)}</a>`
    : '';

  return `<header id="site-header" class="fixed top-0 left-0 w-full z-50">
  <div class="backdrop-blur-xl border-b border-${tint}/10" style="background:${bg}cc">
    <nav class="max-w-7xl mx-auto px-6 md:px-8 h-[68px] flex items-center justify-between">
      <a href="#hero" class="flex items-center gap-2.5 font-bold text-lg" style="color:${textPrimary}">
        <span class="inline-flex h-9 w-9 items-center justify-center ${radius} text-white font-bold" style="background:${primary}">${esc((biz.name || 'B').charAt(0))}</span>
        <span class="hidden sm:inline">${esc(biz.name)}</span>
      </a>
      <div class="hidden md:flex items-center gap-7" style="color:${textPrimary}">${links}</div>
      <div class="flex items-center gap-3">
        ${phoneBtn}
        <${CtaTag} ${ctaAttrs} class="hidden sm:inline-flex px-4 py-2 ${radius} text-white text-sm font-semibold transition-transform hover:-translate-y-0.5" style="background:${primary}">${cta}</${CtaTag}>
        <button type="button" id="mobile-menu-btn" class="md:hidden inline-flex items-center justify-center h-10 w-10 ${radius} border border-${tint}/15" style="color:${textPrimary}" aria-label="Open menu"><i data-lucide="menu" class="w-5 h-5"></i></button>
      </div>
    </nav>
    <div id="mobile-menu" class="hidden md:hidden border-t border-${tint}/10 px-4 py-3" style="background:${bg};color:${textPrimary}">
      ${mobileLinks}
      <${CtaTag} ${ctaAttrs} data-close-menu class="block w-full text-center mt-2 px-4 py-2.5 ${radius} text-white text-sm font-semibold" style="background:${primary}">${cta}</${CtaTag}>
    </div>
  </div>
</header>`;
};

const buildFooterHtml = (biz, sd, navSections) => {
  const c = sd.colorPalette || {};
  const light = isLightHex(c.background);
  const tint = light ? 'black' : 'white';
  const radius = (sd.styleTokens && sd.styleTokens.borderRadius) || 'rounded-xl';
  const primary = c.primary || '#6C63FF';
  const textPrimary = c.textPrimary || (light ? '#0f172a' : '#ffffff');
  const year = new Date().getFullYear();
  const mapsQuery = encodeURIComponent(biz.address || `${biz.name} ${biz.city}`);

  const quickLinks = navSections.map(s => `<a href="#${s.id}" class="block text-sm opacity-70 hover:opacity-100 transition-opacity mb-2">${esc(s.label)}</a>`).join('\n');
  const contactRows = [
    biz.phone ? `<a href="tel:${esc(biz.phone)}" class="flex items-center gap-2 text-sm opacity-70 hover:opacity-100 mb-2"><i data-lucide="phone" class="w-4 h-4"></i>${esc(biz.phone)}</a>` : '',
    (biz.address || biz.city) ? `<a href="https://maps.google.com/?q=${mapsQuery}" target="_blank" rel="noopener" class="flex items-start gap-2 text-sm opacity-70 hover:opacity-100 mb-2"><i data-lucide="map-pin" class="w-4 h-4 mt-0.5 shrink-0"></i><span>${esc(biz.address || biz.city)}</span></a>` : '',
    biz.hours ? `<div class="flex items-start gap-2 text-sm opacity-70 mb-2"><i data-lucide="clock" class="w-4 h-4 mt-0.5 shrink-0"></i><span>${esc(String(biz.hours).substring(0, 90))}</span></div>` : '',
  ].filter(Boolean).join('\n');

  return `<footer id="contact" class="w-full border-t border-${tint}/10" style="color:${textPrimary}">
  <div class="max-w-7xl mx-auto px-6 md:px-8 py-16">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-10">
      <div class="md:col-span-1">
        <div class="flex items-center gap-2.5 font-bold text-lg mb-3">
          <span class="inline-flex h-9 w-9 items-center justify-center ${radius} text-white font-bold" style="background:${primary}">${esc((biz.name || 'B').charAt(0))}</span>
          <span>${esc(biz.name)}</span>
        </div>
        <p class="text-sm opacity-70 leading-relaxed">${esc(biz.category ? `Your trusted ${biz.category} in ${biz.city || 'town'}.` : `Serving ${biz.city || 'our community'} with pride.`)}</p>
        ${biz.rating && biz.rating !== 'N/A' ? `<p class="text-sm opacity-70 mt-3">⭐ ${esc(biz.rating)} · ${esc(biz.reviewCount || 0)} reviews</p>` : ''}
      </div>
      <div>
        <h4 class="font-semibold mb-4 text-sm uppercase tracking-wide opacity-90">Explore</h4>
        ${quickLinks}
      </div>
      <div>
        <h4 class="font-semibold mb-4 text-sm uppercase tracking-wide opacity-90">Contact</h4>
        ${contactRows || '<p class="text-sm opacity-70">Get in touch with us.</p>'}
      </div>
      <div>
        <h4 class="font-semibold mb-4 text-sm uppercase tracking-wide opacity-90">Newsletter</h4>
        <p class="text-sm opacity-70 mb-3">Get deals, tips & updates straight to your inbox.</p>
        <form data-newsletter class="flex flex-col gap-2">
          <input type="email" name="email" required placeholder="you@example.com" class="w-full px-4 py-2.5 ${radius} border border-${tint}/15 text-sm outline-none" style="background:${tint === 'black' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'};color:${textPrimary}">
          <button type="submit" class="w-full px-4 py-2.5 ${radius} text-white text-sm font-semibold transition-transform hover:-translate-y-0.5" style="background:${primary}">Subscribe</button>
        </form>
      </div>
    </div>
    <div class="mt-12 pt-6 border-t border-${tint}/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm opacity-60">
      <span>© ${year} ${esc(biz.name)}. All rights reserved.</span>
      <span class="flex items-center gap-1">Made with <i data-lucide="heart" class="w-3.5 h-3.5"></i> on Localify</span>
    </div>
  </div>
</footer>`;
};

// Deterministic fallbacks so the CONSISTENT sections (hero, reviews) are never
// missing even if their LLM call fails.
const buildFallbackHero = (biz, sd, photoUrls) => {
  const c = sd.colorPalette || {};
  const light = isLightHex(c.background);
  const tint = light ? 'black' : 'white';
  const primary = c.primary || '#6C63FF';
  const radius = (sd.styleTokens && sd.styleTokens.borderRadius) || 'rounded-2xl';
  const isCart = sd.primaryAction === 'cart' && sd.__commerceId;
  const cta = esc(sd.primaryCta || (sd.primaryAction === 'cart' ? 'Shop Now' : 'Book Now'));
  const primaryBtn = isCart
    ? `<a href="#${sd.__commerceId}" class="px-6 py-3 ${radius} text-white font-semibold transition-transform hover:-translate-y-0.5" style="background:${primary}">${cta}</a>`
    : `<button type="button" data-book class="px-6 py-3 ${radius} text-white font-semibold transition-transform hover:-translate-y-0.5" style="background:${primary}">${cta}</button>`;
  const photo = photoUrls && photoUrls[0];
  return `<section id="hero" class="relative w-full min-h-[calc(100vh-64px)] flex items-center overflow-hidden">
  <div class="max-w-7xl mx-auto px-6 md:px-8 py-6 grid grid-cols-1 md:grid-cols-2 gap-10 items-center w-full">
    <div>
      ${biz.rating && biz.rating !== 'N/A' ? `<div class="inline-flex items-center gap-2 px-3 py-1 ${radius} text-xs font-semibold mb-5" style="background:${primary}22;color:${primary}">⭐ ${esc(biz.rating)} · ${esc(biz.reviewCount || 0)} reviews</div>` : ''}
      <h1 class="font-heading text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-5">${esc(biz.name)}</h1>
      <p class="text-lg opacity-80 mb-8 max-w-lg">${esc(biz.category ? `Your trusted ${biz.category} in ${biz.city || 'town'}.` : `Serving ${biz.city || 'our community'}.`)}</p>
      <div class="flex flex-wrap gap-3">
        ${primaryBtn}
        ${biz.phone ? `<a href="tel:${esc(biz.phone)}" class="px-6 py-3 ${radius} font-semibold border border-${tint}/20 transition-transform hover:-translate-y-0.5">Call Now</a>` : ''}
      </div>
    </div>
    ${photo ? `<div class="aspect-[4/3] ${radius} overflow-hidden"><img src="${photo}" alt="${esc(biz.name)}" class="w-full h-full object-cover" loading="lazy" onerror="this.style.display='none'"></div>` : ''}
  </div>
</section>`;
};

const buildFallbackReviews = (biz, sd, reviews) => {
  const c = sd.colorPalette || {};
  const light = isLightHex(c.background);
  const tint = light ? 'black' : 'white';
  const radius = (sd.styleTokens && sd.styleTokens.borderRadius) || 'rounded-2xl';
  const cards = (reviews || []).slice(0, 3).map(r => {
    const n = Math.round(r.rating || 5);
    const stars = '★'.repeat(n) + '☆'.repeat(5 - n);
    return `<div class="p-5 ${radius} border border-${tint}/10" style="background:${tint === 'black' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)'}">
      <div class="text-amber-400 text-sm mb-2">${stars}</div>
      <p class="text-sm opacity-80 leading-relaxed mb-3">"${esc((r.text || '').substring(0, 140))}"</p>
      <p class="font-semibold text-sm">${esc(r.authorName || 'Customer')}</p>
    </div>`;
  }).join('\n');
  return `<section id="reviews" class="relative w-full py-12 md:py-16">
  <div class="max-w-7xl mx-auto px-6 md:px-8">
    <h2 class="text-2xl md:text-3xl font-bold mb-8 text-center">What Our Customers Say</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5">${cards || '<div class="col-span-full text-center opacity-60">Great reviews coming soon.</div>'}</div>
  </div>
</section>`;
};

// ============================================================================
// PIPELINE ORCHESTRATION
// ============================================================================

const generateAgenticWebsiteLogic = async (business, survey, brandContext, onProgress, existingWebsite) => {
  const brandColor = survey?.color || brandContext.color || '#6C63FF';
  const category = (business.categories || [])[0] || 'business';
  const name = cleanBusinessName(business.name);
  const city = business.location?.city || '';
  const state = business.location?.state || '';
  const phone = business.phone || '';
  const address = business.address || business.location?.address || '';
  const rating = business.rating || 'N/A';
  const reviewCount = business.reviewCount || 0;
  const vibe = brandContext.theme || 'Modern, premium, clean';
  const reviewContext = (business.reviews || []).slice(0, 5).map(r => `"${r.text}" — ${r.authorName || 'Customer'} (${r.rating}★)`).join('\n');
  const hours = Array.isArray(business.openingHours) ? business.openingHours.join(', ') : (typeof business.openingHours === 'string' ? business.openingHours : '');

  // Build real Google Maps photo URLs
  const apiBase = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(':5173', ':5000') : 'http://localhost:5000';
  const photoUrls = (business.photos || []).slice(0, 8).map((p) => {
    const ref = p.ref || p.photo_reference || p;
    return `${apiBase}/api/business/photo?ref=${encodeURIComponent(typeof ref === 'string' ? ref : '')}&maxwidth=800`;
  }).filter(url => url.includes('ref=') && !url.includes('ref=&'));

  const surveyAnswers = Object.entries(survey || {})
    .filter(([k]) => k !== 'color')
    .map(([k, v]) => `• ${k}: "${v}"`)
    .join('\n');

  const contextStr = `Business Name: "${name}"
Category: ${category}
Location: ${city}${state ? `, ${state}` : ''}
Full Address: ${address}
Phone: ${phone}
Rating: ${rating}★ (${reviewCount} reviews)
Brand Color: ${brandColor}
Brand Vibe: ${vibe}
Opening Hours: ${hours || 'Not specified'}

REAL BUSINESS PHOTO URLs (use these as img src — real images from Google Maps):
${photoUrls.map((url, i) => `Photo ${i + 1}: ${url}`).join('\n')}

TOP CUSTOMER REVIEWS:
${reviewContext || 'No reviews available'}`;

  const contextHash = getContextHash(contextStr + surveyAnswers);
  const metrics = {};
  const qaReports = [];
  const qualityScores = { overall: 0 };
  
  // ======================================================================
  // PHASE 1: DEEP PLANNING
  // ======================================================================
  
  let strategyDesign, architectSpec;
  const cache = existingWebsite?.intermediateSpecs || {};
  const isCacheValid = cache.version === PIPELINE_CONFIG.promptVersion && cache.contextHash === contextHash;

  if (isCacheValid && cache.strategyDesign && cache.architect) {
    if (onProgress) onProgress({ status: 'Phase 1', message: '🚀 Restoring cached design plans...', progress: 15 });
    strategyDesign = cache.strategyDesign;
    architectSpec = cache.architect;
    metrics['CacheRestore'] = '0.1s';
  } else {
    strategyDesign = await measureExecution('Strategy+Design', 
      () => strategyDesignAgent(contextStr, surveyAnswers, onProgress), metrics);
    
    architectSpec = await measureExecution('Architect', 
      () => architectAgent(strategyDesign, contextStr, onProgress), metrics);
  }
  
  const intermediateSpecs = {
    version: PIPELINE_CONFIG.promptVersion,
    contextHash,
    strategyDesign,
    architect: architectSpec,
  };

  // ======================================================================
  // PHASE 2: HERO (fixed) + DYNAMIC AI-CHOSEN SECTIONS + REVIEWS (fixed, compact)
  // Header + footer are deterministic (built after) → never missing.
  // ======================================================================

  if (onProgress) onProgress({ status: 'Phase 2', message: '💻 Designing & building your unique sections...', progress: 20 });

  const sd = strategyDesign;
  const biz = { name, category, city, state, phone, address, rating, reviewCount, hours };

  const dynamicSections = Array.isArray(architectSpec.dynamicSections) ? architectSpec.dynamicSections : [];

  // Category-appropriate PRIMARY ACTION: retail/shops → a real cart ("Add to
  // Cart"/"Buy"); everything else (restaurants, hotels, clinics, services) →
  // booking/reservation. This drives the hero CTA and the product-card buttons.
  const CART_RE = /shop|store|retail|cloth|apparel|fashion|garment|electronic|mobile|grocery|supermarket|pharmac|boutique|footwear|shoe|jewell?er|hardware|furnitur|bakery|sweet|stationer|gift|optical|watch|mart|kirana|wholesale|distributor/i;
  strategyDesign.primaryAction = CART_RE.test(`${category} ${name}`.toLowerCase()) ? 'cart' : 'booking';
  // The product/menu section id, so the hero + navbar primary can scroll to it.
  const commerceSec = dynamicSections.find(d => d.type === 'showcase' || d.type === 'menu')
    || dynamicSections.find(d => d.type === 'features');
  strategyDesign.__commerceId = commerceSec ? commerceSec.id : '';
  strategyDesign.__navHint = (dynamicSections[0] && dynamicSections[0].id) || 'reviews';
  console.log(`[ai] Primary action: ${strategyDesign.primaryAction}${strategyDesign.__commerceId ? ` (commerce section: ${strategyDesign.__commerceId})` : ''}`);

  const heroComponent = { id: 'hero', tag: 'section', type: 'hero', description: `The signature landing hero for ${name} — a ${category} in ${city}.` };
  const reviewsComponent = { id: 'reviews', tag: 'section', type: 'reviews', description: `A compact customer-testimonials strip using the real reviews for ${name}.` };
  const components = [heroComponent, ...dynamicSections, reviewsComponent];

  console.log(`[ai] 🔨 Phase 2: Building ${components.length} sections (${components.map(c => c.id).join(', ')})...`);

  const sectionPromises = components.map((comp, i) =>
    measureExecution(`Section: ${comp.id}`,
      () => buildSingleSection(comp, strategyDesign, contextStr, [], onProgress, i, components.length),
      metrics
    ).then(section => (section && section.html) ? section : null)
  );
  const resolvedSections = await Promise.all(sectionPromises);

  const builtById = {};
  resolvedSections.forEach((s, i) => { if (s) builtById[components[i].id] = s; });

  // Guarantee the consistent sections exist.
  if (!builtById['hero']) {
    console.warn('[ai] ⚠️ Hero failed — using deterministic fallback hero.');
    builtById['hero'] = { id: 'hero', html: buildFallbackHero(biz, sd, photoUrls) };
  }
  if (!builtById['reviews']) {
    console.warn('[ai] ⚠️ Reviews failed — using deterministic fallback reviews.');
    builtById['reviews'] = { id: 'reviews', html: buildFallbackReviews(biz, sd, business.reviews) };
  }

  // Canonical order: hero → dynamic (those that built) → reviews.
  const sections = [builtById['hero']];
  for (const ds of dynamicSections) { if (builtById[ds.id]) sections.push(builtById[ds.id]); }
  sections.push(builtById['reviews']);

  if (sections.length === 0) throw new Error('Developer failed to generate any sections.');
  console.log(`[ai] Phase 2 complete: ${sections.map(s => s.id).join(', ')}`);

  // Navbar / footer links — prefer the architect's specific navLabel, then a
  // type default, then a title-cased id. Keeps nav labels business-specific.
  const NAV_LABELS = {
    features: 'Services', gallery: 'Gallery', stats: 'About', process: 'Process',
    offers: 'Offers', pricing: 'Pricing', faq: 'FAQ', menu: 'Menu', showcase: 'Showcase',
    'map-hours': 'Visit Us', 'cta-banner': 'Get Started', team: 'Team',
  };
  const labelFor = (ds) => (ds.navLabel && ds.navLabel.trim()) || NAV_LABELS[ds.type] || NAV_LABELS[ds.id] ||
    ds.id.charAt(0).toUpperCase() + ds.id.slice(1).replace(/-/g, ' ');
  const navSections = [];
  for (const ds of dynamicSections) { if (builtById[ds.id]) navSections.push({ id: ds.id, label: labelFor(ds) }); }
  navSections.push({ id: 'reviews', label: 'Reviews' });
  navSections.push({ id: 'contact', label: 'Contact' });

  // ======================================================================
  // PHASE 3: QA REVIEW
  // ======================================================================
  
  let retries = 0;
  while (retries < PIPELINE_CONFIG.maxQaRetries + 1) {
    const qaResult = await measureExecution(`QA Review (Check ${retries + 1})`, 
      () => qaAgent(sections, strategyDesign, contextStr, onProgress, retries + 1), metrics);
    
    qaReports.push({ attempt: retries + 1, ...qaResult });
    qualityScores.code = qaResult.overallScore || 8.5;
    qualityScores.overall = qualityScores.code;
    
    if (qaResult.passed || qualityScores.code >= 8.5) {
      console.log(`[ai] ✅ QA PASSED on check ${retries + 1} (Score: ${qualityScores.code})`);
      break;
    }
    
    // If QA failed, try to rebuild specific failed sections
    if (retries < PIPELINE_CONFIG.maxQaRetries) {
      const failedSections = qaResult.failedSections || [];
      const feedback = qaResult.feedback || '';
      
      if (failedSections.length > 0) {
        console.log(`[ai] ⚠️ QA FAILED on: ${failedSections.join(', ')}. Rebuilding...`);
        
        for (const failedId of failedSections) {
          const comp = components.find(c => c.id === failedId);
          if (!comp) continue;
          
          // Rebuild with QA feedback
          const enhancedComp = {
            ...comp,
            description: `${comp.description}\n\nQA FEEDBACK TO FIX: ${feedback}`
          };
          
          const fixed = await measureExecution(`Fix: ${failedId}`, 
            () => buildSingleSection(enhancedComp, strategyDesign, contextStr, sections, onProgress, 0, 1),
            metrics
          );
          
          if (fixed && fixed.html) {
            const idx = sections.findIndex(s => s.id === failedId);
            if (idx !== -1) sections[idx] = fixed;
          }
        }
      }
    }
    
    retries++;
  }

  // ======================================================================
  // PHASE 4: ASSEMBLE FINAL HTML
  // ======================================================================
  
  if (onProgress) onProgress({ status: 'Assembly', message: '📦 Packaging premium website...', progress: 92 });
  
  const fonts = architectSpec.googleFonts || ['Inter'];
  const fontLink = `https://fonts.googleapis.com/css2?${fonts.map(f => `family=${f.replace(/\s+/g, '+')}:wght@300;400;500;600;700;800`).join('&')}&display=swap`;
  const customCss = architectSpec.globalCss || '';
  
  // Deterministic navbar + footer wrap the AI sections → always present & correct.
  const headerHtml = buildHeaderHtml(biz, strategyDesign, navSections);
  const footerHtml = buildFooterHtml(biz, strategyDesign, navSections);

  // Balance each AI section's tags in isolation BEFORE joining, so one broken
  // section can never nest/overlap the ones after it (root cause of overlaps
  // + the disappearing footer).
  const bodySections = sections
    .map(s => balanceHtml(
      (s.html || '')
        .replace(/```html/gi, '').replace(/```/g, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
    ))
    .join('\n');
  const cleanInnerHtml = `${headerHtml}\n${bodySections}\n${footerHtml}`;
  
  const colors = strategyDesign.colorPalette || {};
  const bgColor = colors.background || '#0a0a0a';
  const textColor = colors.textPrimary || '#e8eaf0';
  
  let fullHtml = `<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${name} — ${category}</title>
<meta name="description" content="${name} in ${city}. ${strategyDesign.brandPersonality || 'Premium'} ${category}.">
<link href="${fontLink}" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        heading: ['${fonts[0] || 'Inter'}', 'sans-serif'],
        body: ['${fonts[1] || fonts[0] || 'Inter'}', 'sans-serif'],
      },
      colors: {
        // Register EVERY design-system name the AI naturally writes, so classes
        // like text-primary / bg-background / text-textSecondary actually resolve
        // (previously only brand/accent/surface existed and the rest silently no-op'd).
        brand: '${colors.primary || '#6C63FF'}',
        primary: '${colors.primary || '#6C63FF'}',
        accent: '${colors.accent || '#F59E0B'}',
        surface: '${colors.surface || '#1a1a2e'}',
        background: '${colors.background || '#0a0a0a'}',
        textPrimary: '${colors.textPrimary || '#ffffff'}',
        textSecondary: '${colors.textSecondary || '#94a3b8'}',
      }
    }
  }
}
</script>
<script src="https://unpkg.com/lucide@latest"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { overflow-x: hidden; max-width: 100%; }
body {
  background-color: ${bgColor};
  color: ${textColor};
  font-family: '${fonts[1] || fonts[0] || 'Inter'}', sans-serif;
}
h1, h2, h3, h4, h5, h6 {
  font-family: '${fonts[0] || 'Inter'}', sans-serif;
}
/* ---- Structural safety net: nothing the AI outputs can break the vertical stack ---- */
section, footer { position: relative; width: 100%; display: block; }
img { max-width: 100%; }
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
}
.animate-fade-in-up { animation: fadeInUp 0.8s ease-out forwards; }
.animate-float { animation: float 6s ease-in-out infinite; }
.glass {
  background: rgba(255,255,255,0.05);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.1);
}
.glow { box-shadow: 0 0 30px rgba(108,99,255,0.3); }
.glow-hover:hover { box-shadow: 0 0 40px rgba(108,99,255,0.5); }
${customCss}
</style>
</head>
<body class="antialiased overflow-x-hidden">
`;
  fullHtml += cleanInnerHtml;

  // Booking Modal — fixed to the viewport, opened via the global openBooking().
  fullHtml += `
<div id="booking-modal" class="hidden" style="position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;padding:1rem;">
  <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="closeBooking()"></div>
  <div class="relative w-full max-w-md rounded-2xl p-6 md:p-8 shadow-2xl" style="background: ${colors.surface || '#1a1a2e'}; border: 1px solid rgba(255,255,255,0.12); max-height:92vh; overflow-y:auto;">
    <button onclick="closeBooking()" class="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
    <h3 class="text-xl font-bold mb-1" style="color: ${textColor}">${esc(strategyDesign.primaryAction === 'cart' ? 'Send an Enquiry' : (strategyDesign.primaryCta || 'Book Your Visit'))}</h3>
    <p class="text-sm mb-5" style="color: ${colors.textSecondary || '#94a3b8'}">Fill in your details and we'll get back to you shortly.</p>
    <form id="booking-form" class="space-y-3">
      <input type="text" name="name" placeholder="Your Full Name" required class="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[${colors.primary || '#6C63FF'}] placeholder-gray-400" style="color:${textColor}">
      <input type="tel" name="phone" placeholder="Phone Number" required class="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[${colors.primary || '#6C63FF'}] placeholder-gray-400" style="color:${textColor}">
      <input type="email" name="email" placeholder="Email Address" class="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[${colors.primary || '#6C63FF'}] placeholder-gray-400" style="color:${textColor}">
      <div class="grid grid-cols-2 gap-3">
        <input type="date" name="date" required class="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[${colors.primary || '#6C63FF'}]" style="color:${textColor}">
        <input type="time" name="time" required class="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[${colors.primary || '#6C63FF'}]" style="color:${textColor}">
      </div>
      <textarea name="message" placeholder="Additional notes (optional)" rows="2" class="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[${colors.primary || '#6C63FF'}] placeholder-gray-400 resize-none" style="color:${textColor}"></textarea>
      <button type="submit" class="w-full py-3 rounded-xl font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-lg" style="background: ${colors.primary || '#6C63FF'}">Confirm Booking</button>
    </form>
    <div id="booking-success" class="hidden text-center py-6">
      <div class="text-4xl mb-3">✅</div>
      <h4 class="text-lg font-bold mb-1" style="color: ${textColor}">Booking Confirmed!</h4>
      <p class="text-sm" style="color: ${colors.textSecondary || '#94a3b8'}">We'll contact you shortly to confirm your appointment.</p>
    </div>
  </div>
</div>
`;

  const bizNameJs = JSON.stringify(name);
  const primaryJs = colors.primary || '#6C63FF';
  const accentJs = colors.accent || '#F59E0B';
  const surfaceJs = colors.surface || '#1a1a2e';

  fullHtml += `
<script>try{lucide.createIcons();}catch(e){}</script>
<script>
(function(){
  var BIZ = ${bizNameJs};
  var SURFACE = ${JSON.stringify(surfaceJs)};
  var PRIMARY = ${JSON.stringify(primaryJs)};
  var ACCENT = ${JSON.stringify(accentJs)};

  // ---------- Toast ----------
  function toast(msg){
    var wrap = document.getElementById('lf-toast');
    if(!wrap){
      wrap = document.createElement('div');
      wrap.id = 'lf-toast';
      wrap.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2000;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
      document.body.appendChild(wrap);
    }
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'background:'+PRIMARY+';color:#fff;padding:10px 18px;border-radius:9999px;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.25);opacity:0;transform:translateY(10px);transition:all .25s ease;';
    wrap.appendChild(t);
    requestAnimationFrame(function(){ t.style.opacity='1'; t.style.transform='translateY(0)'; });
    setTimeout(function(){ t.style.opacity='0'; t.style.transform='translateY(10px)'; setTimeout(function(){ t.remove(); }, 300); }, 2400);
  }

  // ---------- localStorage helpers ----------
  var LF = {
    key: function(k){ return 'localify_' + k; },
    get: function(k, def){ try { return JSON.parse(localStorage.getItem(LF.key(k))) ; } catch(e){ return def; } },
    set: function(k, v){ try { localStorage.setItem(LF.key(k), JSON.stringify(v)); } catch(e){} },
    push: function(k, v){ var a = LF.get(k, []); if(!Array.isArray(a)) a=[]; a.push(v); LF.set(k, a); return a; },
    toggle: function(k){ var cur = !!LF.get(k, false); LF.set(k, !cur); return !cur; }
  };
  window.Localify = LF;

  // ---------- Shopping cart (localStorage) ----------
  function cartGet(){ var c = LF.get('cart', []); return Array.isArray(c) ? c : []; }
  function cartSave(c){ LF.set('cart', c); renderCart(); }
  function cartCount(){ return cartGet().reduce(function(n,i){ return n + (i.qty || 1); }, 0); }
  function priceNum(p){ return parseFloat(String(p == null ? '' : p).replace(/[^0-9.]/g, '')) || 0; }
  function addToCart(it){
    var c = cartGet();
    var ex = c.filter(function(i){ return i.name === it.name; })[0];
    if(ex){ ex.qty = (ex.qty || 1) + 1; } else { c.push({ name: it.name, price: it.price || '', image: it.image || '', qty: 1 }); }
    cartSave(c); toast((it.name || 'Item') + ' added to cart');
  }
  function ensureCartUI(){
    if(document.getElementById('lf-cart-btn')) return;
    if(!document.querySelector('[data-cart-add]')) return; // only shops get a cart
    var btn = document.createElement('button');
    btn.id = 'lf-cart-btn'; btn.setAttribute('data-cart-open', ''); btn.setAttribute('aria-label', 'Cart');
    btn.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:1400;width:56px;height:56px;border-radius:9999px;background:' + PRIMARY + ';color:#fff;border:none;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;';
    btn.innerHTML = '<span style="font-size:22px;line-height:1;">&#128722;</span><span id="lf-cart-count" style="position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;font-size:11px;min-width:18px;height:18px;border-radius:9999px;display:none;align-items:center;justify-content:center;padding:0 4px;">0</span>';
    document.body.appendChild(btn);
    var drawer = document.createElement('div');
    drawer.id = 'lf-cart-drawer'; drawer.style.cssText = 'position:fixed;inset:0;z-index:1450;display:none;';
    drawer.innerHTML = '<div data-cart-overlay style="position:absolute;inset:0;background:rgba(0,0,0,.5);"></div>' +
      '<aside style="position:absolute;top:0;right:0;height:100%;width:min(380px,92vw);background:' + SURFACE + ';color:#fff;box-shadow:-10px 0 40px rgba(0,0,0,.4);display:flex;flex-direction:column;">' +
      '<div style="padding:16px 18px;font-weight:700;font-size:18px;border-bottom:1px solid rgba(255,255,255,.1);display:flex;justify-content:space-between;align-items:center;">Your Cart<span data-cart-close style="cursor:pointer;font-size:24px;opacity:.7;line-height:1;">&times;</span></div>' +
      '<div id="lf-cart-items" style="flex:1;overflow-y:auto;padding:12px 18px;"></div>' +
      '<div style="padding:16px 18px;border-top:1px solid rgba(255,255,255,.1);"><div style="display:flex;justify-content:space-between;margin-bottom:12px;font-weight:600;"><span>Total</span><span id="lf-cart-total">&#8377;0</span></div>' +
      '<button data-cart-checkout style="width:100%;padding:12px;border:none;border-radius:12px;background:' + PRIMARY + ';color:#fff;font-weight:600;cursor:pointer;">Checkout</button></div></aside>';
    document.body.appendChild(drawer);
  }
  function renderCart(){
    ensureCartUI();
    var badge = document.getElementById('lf-cart-count');
    if(badge){ var c = cartCount(); badge.textContent = c; badge.style.display = c > 0 ? 'flex' : 'none'; }
    var wrap = document.getElementById('lf-cart-items'); if(!wrap) return;
    var items = cartGet();
    if(!items.length){ wrap.innerHTML = '<p style="opacity:.6;text-align:center;padding:30px 0;">Your cart is empty.</p>'; }
    else {
      wrap.innerHTML = items.map(function(i){
        var img = i.image ? '<img src="' + i.image + '" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex:none;">' : '';
        return '<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.07);">' + img +
          '<div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:600;">' + i.name + '</div>' +
          '<div style="font-size:12px;opacity:.7;">' + (i.price || '') + ' &times; ' + (i.qty || 1) + '</div></div>' +
          '<span data-cart-remove="' + String(i.name).replace(/"/g, '') + '" style="cursor:pointer;opacity:.6;font-size:18px;">&times;</span></div>';
      }).join('');
    }
    var total = items.reduce(function(s, i){ return s + priceNum(i.price) * (i.qty || 1); }, 0);
    var tEl = document.getElementById('lf-cart-total'); if(tEl) tEl.textContent = '₹' + total.toLocaleString('en-IN');
  }
  window.addEventListener('load', renderCart);

  // ---------- Booking modal (viewport-centered, scroll-locked) ----------
  window.openBooking = function(){
    var m = document.getElementById('booking-modal');
    if(!m) return;
    m.classList.remove('hidden');
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };
  window.closeBooking = function(){
    var m = document.getElementById('booking-modal');
    if(!m) return;
    m.classList.add('hidden');
    m.style.display = 'none';
    document.body.style.overflow = '';
  };
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') window.closeBooking(); });

  // ---------- Global click delegation (makes every button do something) ----------
  document.addEventListener('click', function(e){
    var el = e.target.closest('[data-book],[data-save],[data-accordion],[data-lightbox],[data-close-menu],[data-cart-add],[data-cart-open],[data-cart-close],[data-cart-overlay],[data-cart-remove],[data-cart-checkout]');
    if(!el) return;

    if(el.hasAttribute('data-book')){ e.preventDefault(); window.openBooking(); return; }

    if(el.hasAttribute('data-cart-add')){
      e.preventDefault();
      addToCart({ name: el.getAttribute('data-name') || 'Item', price: el.getAttribute('data-price') || '', image: el.getAttribute('data-image') || '' });
      return;
    }
    if(el.hasAttribute('data-cart-open')){ e.preventDefault(); ensureCartUI(); var d = document.getElementById('lf-cart-drawer'); if(d){ d.style.display = 'block'; renderCart(); document.body.style.overflow = 'hidden'; } return; }
    if(el.hasAttribute('data-cart-close') || el.hasAttribute('data-cart-overlay')){ var dd = document.getElementById('lf-cart-drawer'); if(dd) dd.style.display = 'none'; document.body.style.overflow = ''; return; }
    if(el.hasAttribute('data-cart-remove')){ cartSave(cartGet().filter(function(i){ return String(i.name) !== el.getAttribute('data-cart-remove'); })); return; }
    if(el.hasAttribute('data-cart-checkout')){
      var items = cartGet();
      if(!items.length){ toast('Your cart is empty'); return; }
      LF.push('orders', { items: items, createdAt: new Date().toISOString(), business: BIZ });
      LF.set('cart', []); renderCart();
      var dc = document.getElementById('lf-cart-drawer'); if(dc) dc.style.display = 'none'; document.body.style.overflow = '';
      toast('Order placed! We will contact you shortly.');
      return;
    }

    if(el.hasAttribute('data-save')){
      e.preventDefault();
      var k = el.getAttribute('data-save') || 'saved-item';
      var now = LF.toggle(k);
      el.classList.toggle('opacity-60', now);
      var lbl = el.getAttribute('data-saved-label') || 'Saved!';
      toast(now ? lbl : 'Removed');
      return;
    }

    if(el.hasAttribute('data-accordion')){
      e.preventDefault();
      var panel = el.nextElementSibling;
      if(panel){ panel.classList.toggle('hidden'); el.classList.toggle('is-open'); }
      return;
    }

    if(el.hasAttribute('data-lightbox') && el.tagName === 'IMG'){
      e.preventDefault();
      var ov = document.createElement('div');
      ov.style.cssText='position:fixed;inset:0;z-index:1500;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;';
      var big = document.createElement('img');
      big.src = el.src; big.style.cssText='max-width:92vw;max-height:92vh;border-radius:12px;';
      ov.appendChild(big); ov.addEventListener('click', function(){ ov.remove(); });
      document.body.appendChild(ov);
      return;
    }

    if(el.hasAttribute('data-close-menu')){
      var mm = document.getElementById('mobile-menu'); if(mm) mm.classList.add('hidden');
    }
  });

  // ---------- Forms: booking, newsletter, and any [data-store] form ----------
  document.addEventListener('submit', function(e){
    var form = e.target;
    if(!(form && form.tagName === 'FORM')) return;
    var fd = new FormData(form);
    var obj = {}; fd.forEach(function(v,k){ obj[k]=v; });
    obj.business = BIZ; obj.createdAt = new Date().toISOString();

    if(form.id === 'booking-form'){
      e.preventDefault();
      LF.push('bookings', obj);
      var bf = document.getElementById('booking-form');
      var bs = document.getElementById('booking-success');
      if(bf && bs){ bf.classList.add('hidden'); bs.classList.remove('hidden');
        setTimeout(function(){ bf.reset(); bf.classList.remove('hidden'); bs.classList.add('hidden'); window.closeBooking(); }, 2600);
      } else { toast('Booking saved!'); window.closeBooking(); }
      return;
    }
    if(form.hasAttribute('data-newsletter')){ e.preventDefault(); LF.push('newsletter', obj); form.reset(); toast('Subscribed!'); return; }
    if(form.hasAttribute('data-store')){ e.preventDefault(); LF.push(form.getAttribute('data-store') || 'form', obj); form.reset(); toast('Sent! We will get back to you.'); return; }
  });

  // ---------- Mobile menu toggle ----------
  var menuBtn = document.getElementById('mobile-menu-btn');
  var mobileMenu = document.getElementById('mobile-menu');
  if(menuBtn && mobileMenu){ menuBtn.addEventListener('click', function(){ mobileMenu.classList.toggle('hidden'); }); }

  // ---------- Smooth scroll (offset for fixed navbar) ----------
  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href^="#"]');
    if(!a) return;
    var id = a.getAttribute('href');
    if(!id || id === '#') return;
    var target = document.querySelector(id);
    if(target){ e.preventDefault(); var y = target.getBoundingClientRect().top + window.pageYOffset - 72; window.scrollTo({ top: y, behavior: 'smooth' }); }
  });

  // ---------- Scroll reveal for sections ----------
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add('animate-fade-in-up'); io.unobserve(en.target); } });
  }, { threshold: 0.08 });
  document.querySelectorAll('section').forEach(function(el){ io.observe(el); });

  // ---------- Animated counters (data-count) ----------
  var counters = document.querySelectorAll('[data-count]');
  if(counters.length){
    var cio = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        var el = en.target; cio.unobserve(el);
        var end = parseFloat(el.getAttribute('data-count')) || 0, dur = 1200, start = null;
        function step(ts){ if(!start) start = ts; var p = Math.min((ts-start)/dur, 1);
          el.textContent = (Math.floor(p*end)).toLocaleString(); if(p<1) requestAnimationFrame(step); else el.textContent = end.toLocaleString(); }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    counters.forEach(function(el){ cio.observe(el); });
  }

  // ---------- Navbar shadow on scroll ----------
  var hdr = document.getElementById('site-header');
  if(hdr){ window.addEventListener('scroll', function(){ hdr.classList.toggle('shadow-lg', window.scrollY > 40); }); }

  // ---------- Broken-image fallback ----------
  document.querySelectorAll('img').forEach(function(img){
    function broken(){ img.style.display='none'; var box = img.parentElement;
      if(box && !box.dataset.imgFallback){ box.dataset.imgFallback='1'; box.style.background='linear-gradient(135deg,'+PRIMARY+'33,'+ACCENT+'33)'; } }
    img.addEventListener('error', broken);
    if(img.complete && img.naturalWidth === 0) broken();
  });

  // Restore saved-state visuals for data-save buttons.
  document.querySelectorAll('[data-save]').forEach(function(el){
    if(LF.get(el.getAttribute('data-save'), false)) el.classList.add('opacity-60');
  });
})();
</script>
</body>
</html>`;

  if (onProgress) onProgress({ status: 'Complete', message: '🚀 Premium website ready!', progress: 100 });
  
  console.log(`[ai] ✅ Pipeline V4.0 complete! Metrics:`, JSON.stringify(metrics, null, 2));
  
  return { 
    pages: { html: fullHtml }, 
    intermediateSpecs, 
    qualityScores, 
    qaReports, 
    pipelineMetrics: metrics,
    promptVersion: PIPELINE_CONFIG.promptVersion
  };
};

// ============================================================================
// TARGETED BUG FIX — repairs ONLY the issues the user describes, leaving the
// rest of the page byte-for-byte intact. Used by the "Report a bug" feature.
// ============================================================================

/**
 * analyzeBugScreenshot — turns a user's screenshot + note into a concrete,
 * developer-actionable description of the VISIBLE problems. Returns null if
 * vision is unavailable, so the caller can fall back to the text note alone.
 */
const analyzeBugScreenshot = async (imageDataUrl, userText) => {
  if (!imageDataUrl) return null;
  const prompt = `You are a meticulous UI/UX QA reviewer. Attached is a screenshot of a generated business website.${userText ? ` The user says: "${userText}".` : ''}

Describe, SPECIFICALLY and CONCRETELY, what is visually wrong in this screenshot so a developer can fix it. Name the section (hero, navbar, a product/showcase grid, reviews, footer, etc.) and the exact defect — e.g. text overlapping, a large empty/blank box, cards of unequal height, squeezed or stretched cards, misalignment, poor spacing, low contrast, an element off-screen. If it looks fine, say so.

Write 2-5 precise sentences. Do NOT write code — only describe the visible problems.`;

  return await callLlmVision(prompt, [imageDataUrl], { maxTokens: 600 });
};

const fixWebsiteBugs = async (currentHtml, bugsDescription) => {
  if (!currentHtml || !bugsDescription) return null;

  const prompt = `You are a senior front-end engineer doing a SURGICAL fix on an existing single-file website (HTML + Tailwind CDN + inline JS). You return a SMALL SET OF FIND/REPLACE EDITS — never the whole file.

=== THE USER'S REPORTED PROBLEMS (fix ONLY these, change nothing else) ===
${bugsDescription}

=== HOW TO EDIT ===
- Each "find" MUST be an EXACT substring copied verbatim from the CURRENT HTML below. Include enough surrounding text (roughly 1-3 lines) so the snippet is UNIQUE in the document.
- "replace" is the corrected version of that exact snippet.
- To ADD new markup (e.g. a MISSING NAVBAR): set "find" to an existing anchor that appears right before where it should go — e.g. the opening \`<body ...>\` tag or the first \`<section ...>\` — and set "replace" to that SAME anchor text followed by your new markup.
- Keep every existing id (site-header, booking-modal, section ids) and inline JS working. Use Tailwind classes consistent with the existing code.
- Make between 1 and 6 focused edits. Do NOT restyle or reword anything the user didn't mention.

If you add a navigation bar, make it: a fixed top bar (position:fixed;top:0;left:0;width:100%;z-index:50) with a backdrop blur, the business name/logo on the left, anchor links to the existing section ids in the middle (hidden on mobile), and a call-to-action button with the attribute data-book on the right.

=== CURRENT HTML ===
${currentHtml}

=== OUTPUT (JSON only) ===
{
  "edits": [
    { "find": "<exact snippet copied from the CURRENT HTML>", "replace": "<the corrected/expanded snippet>" }
  ],
  "summary": "one short line describing what you changed"
}`;

  const parsed = await runAgentWithRetry(prompt, {
    maxTokens: 6144,
    timeout: PIPELINE_CONFIG.timeouts.section,
    temperature: 0.15,
    model: PIPELINE_CONFIG.models.coder,
  }, 2);

  if (!parsed || !Array.isArray(parsed.edits) || parsed.edits.length === 0) {
    console.warn('[ai] fixWebsiteBugs: model returned no usable edits.');
    return null;
  }

  const { html: patched, applied } = applyEdits(currentHtml, parsed.edits);
  if (applied === 0) {
    console.warn('[ai] fixWebsiteBugs: none of the returned edits matched the document.');
    return null;
  }
  console.log(`[ai] fixWebsiteBugs applied ${applied}/${parsed.edits.length} edit(s). ${parsed.summary || ''}`);
  return patched;
};

const generateAgenticWebsite = async (business, survey, brandContext = {}, onProgress = null, existingWebsite = null) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('GLOBAL_PIPELINE_TIMEOUT'));
    }, PIPELINE_CONFIG.timeouts.global);
  });

  try {
    const result = await Promise.race([
      generateAgenticWebsiteLogic(business, survey, brandContext, onProgress, existingWebsite),
      timeoutPromise
    ]);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
};

module.exports = { generateAgenticWebsite, fixWebsiteBugs, analyzeBugScreenshot, _test: { balanceHtml, buildHeaderHtml, buildFooterHtml, buildFallbackHero, buildFallbackReviews, isLightHex, applyEdits, extractRootTag, stripPartialTail, looksLikeReasoning, cleanBusinessName } };
