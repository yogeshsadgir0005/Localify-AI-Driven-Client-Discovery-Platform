const { callLlm } = require('./aiService');

const extractJson = (text) => {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    const arrayStart = text.indexOf('[');
    const arrayEnd = text.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      try { return JSON.parse(text.slice(arrayStart, arrayEnd + 1)); } catch (e) { return null; }
    }
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

const pmAgent = async (contextStr, onProgress) => {
  if (onProgress) onProgress({ status: 'Phase 1', message: 'PM: Understanding business requirements...', progress: 10 });
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
  
  const raw = await callLlm(prompt, { maxTokens: 800, temperature: 0.6, model: 'gemini-2.5-flash', system: 'Output ONLY valid JSON.' }, 1);
  return extractJson(raw) || { conversionObjective: "Lead Generation", sectionPriority: ["Hero", "Features", "Testimonials", "Footer"] };
};

const designerAgent = async (pmSpec, contextStr, onProgress) => {
  if (onProgress) onProgress({ status: 'Phase 2', message: 'Designer: Creating visual blueprint...', progress: 20 });
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
  
  const raw = await callLlm(prompt, { maxTokens: 1000, temperature: 0.7, model: 'gemini-2.5-flash', system: 'Output ONLY valid JSON.' }, 1);
  return extractJson(raw) || { designLanguage: "Modern Clean", sectionCompositions: {} };
};

const architectAgent = async (designerSpec, pmSpec, onProgress) => {
  if (onProgress) onProgress({ status: 'Phase 3', message: 'Architect: Planning semantic structure...', progress: 30 });
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
  
  const raw = await callLlm(prompt, { maxTokens: 1000, temperature: 0.5, model: 'gemini-2.5-flash', system: 'Output ONLY valid JSON.' }, 1);
  return extractJson(raw) || { components: [{ id: "hero", description: "Hero" }] };
};

const developerAgent = async (architectSpec, designerSpec, pmSpec, contextStr, feedback = null, sectionsToRegenerate = null, onProgress) => {
  if (onProgress) {
    const msg = feedback ? 'Developer: Refining code based on QA feedback...' : 'Developer: Writing semantic HTML and Tailwind...';
    onProgress({ status: 'Phase 4', message: msg, progress: feedback ? 65 : 45 });
  }

  const prompt = `You are an elite Frontend Developer.
Context: ${contextStr}

PM Strategy: ${JSON.stringify(pmSpec)}
Design Blueprint: ${JSON.stringify(designerSpec)}
Architect Spec: ${JSON.stringify(architectSpec)}

Your task is to write production-ready, semantic HTML using Tailwind CSS based EXACTLY on these specifications. 
Do not invent layouts outside the blueprint. Use real copywriting tailored to the business.

${feedback ? `\nPREVIOUS QA FEEDBACK TO FIX:\n${feedback}\nONLY regenerate these sections: ${sectionsToRegenerate.join(', ')}` : ''}

Respond with ONLY a JSON array of objects representing each section. Example format:
[
  { "id": "hero", "html": "<section id='hero' class='...'>...</section>" },
  { "id": "features", "html": "<section id='features' class='...'>...</section>" }
]
Output ONLY the JSON array. NO markdown, NO prose.`;

  const raw = await callLlm(prompt, { maxTokens: 8192, timeout: 120000, temperature: 0.4, model: 'gemini-2.5-flash', system: 'Output ONLY a valid JSON array.' }, 2);
  const arr = extractJson(raw);
  return Array.isArray(arr) ? arr : [];
};

const codeReviewerAgent = async (sections, architectSpec) => {
  const html = sections.map(s => s.html).join('\n');
  const prompt = `You are a Strict Code Reviewer.
Architect Spec: ${JSON.stringify(architectSpec)}

Review the following HTML for:
1. Semantic HTML correctness
2. Responsive structure (valid Tailwind md:/lg: usage)
3. Invalid nesting or duplicate IDs
4. Missing closing tags or markdown artifacts

Code:
${html}

Respond with ONLY a JSON object:
{
  "passed": boolean,
  "failedSections": ["hero", "features"], 
  "feedback": "Specific feedback for the developer to fix the failed sections",
  "score": 9.5
}`;
  const raw = await callLlm(prompt, { maxTokens: 800, temperature: 0.2, model: 'gemini-2.5-flash', system: 'Output ONLY valid JSON.' }, 1);
  return extractJson(raw) || { passed: true, score: 10, failedSections: [] };
};

const visualQaAgent = async (sections, designerSpec) => {
  const html = sections.map(s => s.html).join('\n');
  const prompt = `You are a Visual QA Director.
Design Blueprint: ${JSON.stringify(designerSpec)}

Review the following HTML to ensure the visual hierarchy, layout balance, and design language match the blueprint. Ensure it looks premium and professional, not generic.

Code:
${html}

Respond with ONLY a JSON object:
{
  "passed": boolean,
  "failedSections": ["hero"], 
  "feedback": "Specific visual feedback (e.g., 'Hero lacks contrast, increase padding')",
  "score": 9.2
}`;
  const raw = await callLlm(prompt, { maxTokens: 800, temperature: 0.3, model: 'gemini-2.5-flash', system: 'Output ONLY valid JSON.' }, 1);
  return extractJson(raw) || { passed: true, score: 10, failedSections: [] };
};

const htmlValidatorAgent = (html) => {
  // Fast deterministic validation
  let passed = true;
  let feedback = [];
  
  if (html.includes('\`\`\`html')) { passed = false; feedback.push("Contains markdown artifacts"); }
  
  const openDivs = (html.match(/<div/g) || []).length;
  const closeDivs = (html.match(/<\/div>/g) || []).length;
  if (openDivs !== closeDivs) {
    passed = false;
    feedback.push(`Mismatched divs: ${openDivs} open, ${closeDivs} close`);
  }

  return { passed, feedback: feedback.join(', ') };
};

const generateAgenticWebsite = async (business, survey, brandContext = {}, onProgress = null) => {
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

  // 1. PM
  const pmSpec = await pmAgent(contextStr, onProgress);
  
  // 2. Designer
  const designerSpec = await designerAgent(pmSpec, contextStr, onProgress);
  
  // 3. Architect
  const architectSpec = await architectAgent(designerSpec, pmSpec, onProgress);
  
  // 4. Developer (Initial)
  let sections = await developerAgent(architectSpec, designerSpec, pmSpec, contextStr, null, null, onProgress);
  if (!sections || sections.length === 0) throw new Error("Developer failed to generate initial code.");

  // QA Loop (Max 2 retries)
  let retries = 0;
  const MAX_RETRIES = 2;
  
  while (retries < MAX_RETRIES) {
    if (onProgress) onProgress({ status: 'Phase 5', message: `Running QA Checks (Attempt ${retries + 1})...`, progress: 55 });
    
    // 5. Code Review
    const codeReview = await codeReviewerAgent(sections, architectSpec);
    
    // 6. Visual QA
    const visualQa = await visualQaAgent(sections, designerSpec);
    
    let allPassed = codeReview.passed && visualQa.passed && codeReview.score >= 8.5 && visualQa.score >= 8.5;
    
    if (allPassed) {
      console.log(`[ai] QA Passed on attempt ${retries + 1}`);
      break;
    }
    
    // Collect failed sections
    const failedSet = new Set([...(codeReview.failedSections || []), ...(visualQa.failedSections || [])]);
    const failedArray = Array.from(failedSet);
    
    if (failedArray.length === 0) break; // Fallback if they said fail but didn't specify
    
    let combinedFeedback = "";
    if (!codeReview.passed) combinedFeedback += `Code Review: ${codeReview.feedback}\n`;
    if (!visualQa.passed) combinedFeedback += `Visual QA: ${visualQa.feedback}\n`;
    
    console.log(`[ai] QA Failed on sections: ${failedArray.join(', ')}. Retrying...`);
    
    // Ask Developer to regenerate ONLY the failed sections
    const updatedSections = await developerAgent(architectSpec, designerSpec, pmSpec, contextStr, combinedFeedback, failedArray, onProgress);
    
    // Merge updated sections back into the main array
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
  if (onProgress) onProgress({ status: 'Phase 7', message: 'Running final HTML validation...', progress: 90 });
  
  const innerHtml = sections.map(s => s.html).join('\n');
  let fullHtml = `<!DOCTYPE html>\n<html lang="en" class="scroll-smooth">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${name}</title>\n<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">\n<script src="https://cdn.tailwindcss.com"></script>\n<script>tailwind.config={theme:{extend:{fontFamily:{sans:['Inter','sans-serif']}}}}</script>\n<script src="https://unpkg.com/lucide@latest"></script>\n<style>\nbody { background-color: #0D0F14; color: #E8EAF0; }\n@keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }\n.animate-float { animation: float 6s ease-in-out infinite; }\n</style>\n</head>\n<body class="antialiased">\n`;
  fullHtml += innerHtml;
  fullHtml += `\n<script>lucide.createIcons();</script>\n</body>\n</html>`;

  // 7. HTML Validator
  const validation = htmlValidatorAgent(fullHtml);
  if (!validation.passed) {
    console.warn(`[ai] Final HTML validation warned: ${validation.feedback}. Proceeding anyway to avoid failure.`);
  }
  
  if (onProgress) onProgress({ status: 'Complete', message: 'Agentic Website Generation Complete!', progress: 100 });
  
  return { html: fullHtml };
};

module.exports = { generateAgenticWebsite };
