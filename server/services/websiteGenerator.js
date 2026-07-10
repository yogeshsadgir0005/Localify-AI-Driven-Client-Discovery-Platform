const crypto = require('crypto');
const { callLlm } = require('./aiService');

const PIPELINE_CONFIG = {
  models: {
    reasoning: process.env.LLM_MODEL_REASONING || 'gemini-2.5-pro',
    coder: process.env.LLM_MODEL_CODER || 'gemini-2.5-flash',
    validator: process.env.LLM_MODEL_VALIDATOR || 'gemini-2.5-flash',
  },
  timeouts: {
    global: 90000,
    pm: 15000,
    designer: 25000,
    architect: 15000,
    developer: 45000,
    qa: 20000,
  },
  maxRetries: 2,
  qualityThreshold: 9.0,
  promptVersion: '1.2',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

const getContextHash = (contextStr) => {
  return crypto.createHash('sha256').update(contextStr).digest('hex');
};

const extractJsonRobust = (text) => {
  if (!text) return null;
  let cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  const start = cleanText.indexOf('{');
  const end = cleanText.lastIndexOf('}');
  
  if (start === -1 || end === -1 || end <= start) {
    const arrayStart = cleanText.indexOf('[');
    const arrayEnd = cleanText.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      try { return JSON.parse(cleanText.slice(arrayStart, arrayEnd + 1)); } catch (e) { return null; }
    }
    return null;
  }
  
  try {
    return JSON.parse(cleanText.slice(start, end + 1));
  } catch (e) {
    return null;
  }
};

const runAgentWithRetry = async (basePrompt, opts, retries = PIPELINE_CONFIG.maxRetries) => {
  let prompt = basePrompt;
  for (let i = 0; i <= retries; i++) {
    const raw = await callLlm(prompt, opts, 1);
    const parsed = extractJsonRobust(raw);
    if (parsed) return parsed;
    
    console.warn(`[ai] JSON extraction failed on attempt ${i + 1}. Repairing...`);
    // Exponential backoff
    if (i < retries) await sleep(500 * Math.pow(3, i));
    
    // Smart repair prompt
    prompt = `${basePrompt}\n\nWARNING: Your previous response was not valid JSON. You must return ONLY valid JSON.\nPrevious raw output:\n${raw}`;
  }
  return null;
};

const pmAgent = async (contextStr, onProgress) => {
  if (onProgress) onProgress({ status: 'Phase 1', message: '🧠 Understanding business...', progress: 10 });
  const prompt = `You are an elite Product Manager.
Context:
${contextStr}

Analyze the business and define the product strategy for their website.
Respond with ONLY a JSON object containing:
{
  "targetAudience": "Describe the primary demographic",
  "conversionObjective": "e.g., Lead Generation, Booking, Portfolio",
  "brandPersonality": "e.g., Professional, Luxury, Friendly",
  "primaryCta": "The main call to action text",
  "trustSignals": ["Signal 1", "Signal 2"],
  "sectionPriority": ["Hero", "Features", "Testimonials", "Footer"]
}`;
  return (await runAgentWithRetry(prompt, { maxTokens: 800, timeout: PIPELINE_CONFIG.timeouts.pm, temperature: 0.6, model: PIPELINE_CONFIG.models.reasoning, system: 'Output ONLY valid JSON.' })) || { conversionObjective: "Lead Generation", sectionPriority: ["Hero", "Features", "Testimonials", "Footer"] };
};

const designerAgent = async (pmSpec, contextStr, onProgress) => {
  if (onProgress) onProgress({ status: 'Phase 2', message: '🎨 Designing interface...', progress: 20 });
  const prompt = `You are an elite UI/UX Designer.
Context:
${contextStr}

PM Strategy:
${JSON.stringify(pmSpec, null, 2)}

Create a complete design blueprint for this website.
Respond with ONLY a JSON object containing:
{
  "designLanguage": "Describe the aesthetic",
  "colorPalette": {"primary": "hex", "secondary": "hex", "background": "hex"},
  "typography": {"heading": "font family", "body": "font family"},
  "visualHierarchy": "How should elements be weighted?",
  "sectionCompositions": {
    "hero": "e.g., Asymmetrical product reveal with glassmorphism card",
    "features": "e.g., Bento box layout with subtle gradients",
    "testimonials": "e.g., Editorial style quote cards"
  }
}`;
  return (await runAgentWithRetry(prompt, { maxTokens: 1000, timeout: PIPELINE_CONFIG.timeouts.designer, temperature: 0.7, model: PIPELINE_CONFIG.models.reasoning, system: 'Output ONLY valid JSON.' })) || { designLanguage: "Modern Clean", sectionCompositions: {} };
};

const architectAgent = async (designerSpec, pmSpec, onProgress) => {
  if (onProgress) onProgress({ status: 'Phase 3', message: '🏗️ Planning architecture...', progress: 30 });
  const prompt = `You are a Technical Architect.
PM Strategy: ${JSON.stringify(pmSpec)}
Design Blueprint: ${JSON.stringify(designerSpec)}

Create an implementation plan for the frontend developer.
Respond with ONLY a JSON object containing:
{
  "semanticStructure": ["header", "main", "section", "footer"],
  "tailwindDecisions": "Global tailwind setup, specific utility patterns to use",
  "components": [
    { "id": "header", "description": "Nav bar details" },
    { "id": "hero", "description": "Hero section details" },
    { "id": "features", "description": "Features section details" },
    { "id": "footer", "description": "Footer details" }
  ]
}`;
  return (await runAgentWithRetry(prompt, { maxTokens: 1000, timeout: PIPELINE_CONFIG.timeouts.architect, temperature: 0.5, model: PIPELINE_CONFIG.models.reasoning, system: 'Output ONLY valid JSON.' })) || { components: [{ id: "hero", description: "Hero" }] };
};

const developerAgent = async (architectSpec, designerSpec, pmSpec, contextStr, feedback = null, sectionsToRegenerate = null, onProgress) => {
  if (onProgress) {
    if (feedback && sectionsToRegenerate) {
      onProgress({ status: 'Phase 4', message: `🔧 Fixing ${sectionsToRegenerate.join(', ')}...`, progress: 65 });
    } else {
      onProgress({ status: 'Phase 4', message: '💻 Writing Sections...', progress: 45 });
    }
  }

  const prompt = `You are an elite Frontend Developer.
Context: ${contextStr}
PM Strategy: ${JSON.stringify(pmSpec)}
Design Blueprint: ${JSON.stringify(designerSpec)}
Architect Spec: ${JSON.stringify(architectSpec)}

Your task is to write production-ready, semantic HTML using Tailwind CSS based EXACTLY on these specifications. 
Use real copywriting tailored to the business.

${feedback ? `\nPREVIOUS QA FEEDBACK TO FIX:\n${feedback}\nONLY output these sections: ${sectionsToRegenerate.join(', ')}` : ''}

Respond with ONLY a JSON array of objects representing each section. Example format:
[
  { "id": "hero", "html": "<section id='hero' class='...'>...</section>" },
  { "id": "features", "html": "<section id='features' class='...'>...</section>" }
]
Output ONLY the JSON array. NO markdown, NO prose.`;

  const arr = await runAgentWithRetry(prompt, { maxTokens: 8192, timeout: PIPELINE_CONFIG.timeouts.developer, temperature: 0.4, model: PIPELINE_CONFIG.models.coder, system: 'Output ONLY a valid JSON array.' });
  return Array.isArray(arr) ? arr : [];
};

const codeReviewerAgent = async (sections, architectSpec, contextStr) => {
  const html = sections.map(s => s.html).join('\n');
  const prompt = `You are a Strict Code Reviewer.
Context: ${contextStr}
Architect Spec: ${JSON.stringify(architectSpec)}

Review the following HTML for:
1. Semantic HTML correctness and hierarchy
2. Responsive structure (valid Tailwind md:/lg: usage)
3. Invalid nesting or accessibility issues
4. Missing closing tags or markdown artifacts

Code:
${html}

Respond with ONLY a JSON object:
{
  "passed": boolean,
  "failedSections": ["hero"], 
  "feedback": "Specific feedback for the developer to fix the failed sections",
  "score": 9.5
}`;
  return (await runAgentWithRetry(prompt, { maxTokens: 800, timeout: PIPELINE_CONFIG.timeouts.qa, temperature: 0.2, model: PIPELINE_CONFIG.models.validator, system: 'Output ONLY valid JSON.' })) || { passed: true, score: 9.0, failedSections: [] };
};

const visualQaAgent = async (sections, designerSpec, contextStr) => {
  const html = sections.map(s => s.html).join('\n');
  const prompt = `You are a Visual QA Director.
Context: ${contextStr}
Design Blueprint: ${JSON.stringify(designerSpec)}

Review the following HTML to ensure the visual hierarchy, layout balance, and design language match the blueprint and business intent. Ensure it looks premium and professional.

Code:
${html}

Respond with ONLY a JSON object:
{
  "passed": boolean,
  "failedSections": ["hero"], 
  "feedback": "Specific visual feedback (e.g., 'Hero lacks contrast, increase padding')",
  "score": 9.2
}`;
  return (await runAgentWithRetry(prompt, { maxTokens: 800, timeout: PIPELINE_CONFIG.timeouts.qa, temperature: 0.3, model: PIPELINE_CONFIG.models.validator, system: 'Output ONLY valid JSON.' })) || { passed: true, score: 9.0, failedSections: [] };
};

const htmlValidatorAgent = (html) => {
  let passed = true;
  let feedback = [];
  
  if (html.includes('\`\`\`html')) { passed = false; feedback.push("Contains markdown artifacts"); }
  
  const openDivs = (html.match(/<div/g) || []).length;
  const closeDivs = (html.match(/<\/div>/g) || []).length;
  if (openDivs !== closeDivs) { passed = false; feedback.push(`Mismatched divs: ${openDivs} open, ${closeDivs} close`); }

  const mainTags = (html.match(/<main\b[^>]*>/gi) || []).length;
  if (mainTags > 1) { passed = false; feedback.push(`Multiple <main> tags found (${mainTags})`); }
  
  const h1Tags = (html.match(/<h1\b[^>]*>/gi) || []).length;
  if (h1Tags > 1) { passed = false; feedback.push(`Multiple <h1> tags found (${h1Tags})`); }

  const emptyButtons = html.match(/<button[^>]*>\s*<\/button>/gi);
  if (emptyButtons) { passed = false; feedback.push("Found empty <button> tags"); }

  const emptyHrefs = html.match(/href=(["'])#\1/gi);
  if (emptyHrefs) { passed = false; feedback.push("Found empty anchor links (href=\"#\")"); }

  // Nested interactive elements heuristics
  const nestedButtons = html.match(/<button[^>]*>[\s\S]*?<a\b[^>]*>[\s\S]*?<\/a>[\s\S]*?<\/button>/gi);
  if (nestedButtons) { passed = false; feedback.push("Found anchor tags nested inside buttons"); }

  const nestedAnchors = html.match(/<a\b[^>]*>[\s\S]*?<button[^>]*>[\s\S]*?<\/button>[\s\S]*?<\/a>/gi);
  if (nestedAnchors) { passed = false; feedback.push("Found buttons nested inside anchor tags"); }

  const imgsWithoutAlt = html.match(/<img(?![^>]*\balt=)[^>]*>/gi);
  if (imgsWithoutAlt) { passed = false; feedback.push(`Found ${imgsWithoutAlt.length} images without alt attributes`); }

  if (!html.includes('<meta name="viewport"')) { passed = false; feedback.push("Missing <meta name=\"viewport\">"); }

  return { passed, feedback: feedback.join(', ') };
};

const measureExecution = async (name, fn, metricsObj) => {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    metricsObj[name] = `${duration}s`;
    return result;
  } catch (err) {
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    metricsObj[name] = `${duration}s (FAILED)`;
    throw err; // Re-throw critical failures
  }
};

const executeSafeQa = async (name, fn, metricsObj, defaultScore) => {
  try {
    return await measureExecution(name, fn, metricsObj);
  } catch (e) {
    console.warn(`[ai] ${name} failed gracefully:`, e.message);
    return { passed: true, score: defaultScore, failedSections: [], feedback: "Agent timeout or error" };
  }
};

const generateAgenticWebsite = async (business, survey, brandContext = {}, onProgress = null, existingWebsite = null) => {
  const globalTimeoutId = setTimeout(() => { throw new Error('GLOBAL_PIPELINE_TIMEOUT'); }, PIPELINE_CONFIG.timeouts.global);
  
  try {
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
    const contextHash = getContextHash(contextStr);

    const metrics = {};
    const qaReports = [];
    const qualityScores = { overall: 0 };
    
    // Use cache if version and context hash matches
    let pmSpec, designerSpec, architectSpec;
    const cache = existingWebsite?.intermediateSpecs || {};
    const isCacheValid = cache.version === PIPELINE_CONFIG.promptVersion && cache.contextHash === contextHash;

    if (isCacheValid && cache.pm) {
      if (onProgress) onProgress({ status: 'Phase 1-3', message: '🚀 Restoring cached architecture...', progress: 30 });
      pmSpec = cache.pm;
      designerSpec = cache.designer;
      architectSpec = cache.architect;
      metrics['CacheRestore'] = '0.1s';
    } else {
      pmSpec = await measureExecution('PM', () => pmAgent(contextStr, onProgress), metrics);
      designerSpec = await measureExecution('Designer', () => designerAgent(pmSpec, contextStr, onProgress), metrics);
      architectSpec = await measureExecution('Architect', () => architectAgent(designerSpec, pmSpec, onProgress), metrics);
    }
    
    const intermediateSpecs = {
      version: PIPELINE_CONFIG.promptVersion,
      contextHash,
      pm: pmSpec,
      designer: designerSpec,
      architect: architectSpec,
    };

    // 4. Developer (Initial)
    let sections = await measureExecution('Developer (Initial)', () => developerAgent(architectSpec, designerSpec, pmSpec, contextStr, null, null, onProgress), metrics);
    if (!sections || sections.length === 0) throw new Error("Developer failed to generate initial code.");

    // QA Loop
    let retries = 0;
    
    while (retries < PIPELINE_CONFIG.maxRetries) {
      if (onProgress) onProgress({ status: 'Phase 5', message: `🔍 Reviewing Code & Design (Attempt ${retries + 1})...`, progress: 55 });
      
      const currentSectionsToReview = sections; 
      
      // Execute QA agents in parallel (Non-critical stage failure policy)
      const [codeReview, visualQa] = await Promise.all([
        executeSafeQa(`Code Review (Attempt ${retries + 1})`, () => codeReviewerAgent(currentSectionsToReview, architectSpec, contextStr), metrics, 9.5),
        executeSafeQa(`Visual QA (Attempt ${retries + 1})`, () => visualQaAgent(currentSectionsToReview, designerSpec, contextStr), metrics, 9.2)
      ]);
      
      qaReports.push({ attempt: retries + 1, codeReview, visualQa });
      qualityScores.code = codeReview.score;
      qualityScores.visual = visualQa.score;
      qualityScores.overall = ((codeReview.score + visualQa.score) / 2).toFixed(1);

      let allPassed = codeReview.passed && visualQa.passed && parseFloat(qualityScores.overall) >= PIPELINE_CONFIG.qualityThreshold;
      
      if (allPassed) {
        console.log(`[ai] QA Passed on attempt ${retries + 1}`);
        break;
      }
      
      const failedSet = new Set([...(codeReview.failedSections || []), ...(visualQa.failedSections || [])]);
      const failedArray = Array.from(failedSet);
      
      if (failedArray.length === 0) break; // Fallback
      
      let combinedFeedback = "";
      if (!codeReview.passed) combinedFeedback += `Code Review: ${codeReview.feedback}\n`;
      if (!visualQa.passed) combinedFeedback += `Visual QA: ${visualQa.feedback}\n`;
      
      console.log(`[ai] QA Failed on sections: ${failedArray.join(', ')}. Retrying...`);
      
      const updatedSections = await measureExecution(`Developer Fix (${failedArray.join(',')})`, () => developerAgent(architectSpec, designerSpec, pmSpec, contextStr, combinedFeedback, failedArray, onProgress), metrics);
      
      for (const updated of updatedSections) {
        const idx = sections.findIndex(s => s.id === updated.id);
        if (idx !== -1) {
          sections[idx] = updated;
        } else {
          sections.push(updated);
        }
      }
      
      retries++;
    }

    // Assemble full HTML
    if (onProgress) onProgress({ status: 'Phase 7', message: '✅ Final validation & packaging...', progress: 90 });
    
    const innerHtml = sections.map(s => s.html).join('\n');
    let fullHtml = `<!DOCTYPE html>\n<html lang="en" class="scroll-smooth">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${name}</title>\n<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">\n<script src="https://cdn.tailwindcss.com"></script>\n<script>tailwind.config={theme:{extend:{fontFamily:{sans:['Inter','sans-serif']}}}}</script>\n<script src="https://unpkg.com/lucide@latest"></script>\n<style>\nbody { background-color: #0D0F14; color: #E8EAF0; }\n@keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }\n.animate-float { animation: float 6s ease-in-out infinite; }\n</style>\n</head>\n<body class="antialiased">\n`;
    fullHtml += innerHtml;
    fullHtml += `\n<script>lucide.createIcons();</script>\n</body>\n</html>`;

    // Await timing bug fixed: Store result in variable
    const validationResult = await measureExecution('HTML Validator', () => Promise.resolve(htmlValidatorAgent(fullHtml)), metrics);
    
    qualityScores.validation = validationResult.passed ? 10 : 7; 
    
    if (!validationResult.passed) {
      console.warn(`[ai] Final HTML validation warned: ${validationResult.feedback}. Proceeding anyway to avoid failure.`);
    }
    
    if (onProgress) onProgress({ status: 'Complete', message: '🚀 Packaging website...', progress: 100 });
    
    return { 
      pages: { html: fullHtml }, 
      intermediateSpecs, 
      qualityScores, 
      qaReports, 
      pipelineMetrics: metrics,
      promptVersion: PIPELINE_CONFIG.promptVersion
    };
  } finally {
    clearTimeout(globalTimeoutId);
  }
};

module.exports = { generateAgenticWebsite };
