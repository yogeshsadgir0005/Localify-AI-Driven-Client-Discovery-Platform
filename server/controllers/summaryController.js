const NodeCache = require('node-cache');
const { GoogleMapsError } = require('../utils/googleMaps');
const { getDetailCached } = require('./businessController');
const aiService = require('../services/aiService');
const { logEvent } = require('../utils/telemetry');

// Cache generated summaries for 6h so repeat requests are instant and free.
const summaryCache = new NodeCache({ stdTTL: 6 * 60 * 60, checkperiod: 600 });

// Label reported back to the client (which free model produced the text).
const MODEL_LABEL = () => process.env.GROQ_MODEL || 'groq';

const FALLBACK_MESSAGE =
  'AI summary unavailable — set GROQ_API_KEY on the server to enable this feature.';

/**
 * Build the LLM prompt from normalized business data.
 */
const buildPrompt = (b) => {
  const category =
    Array.isArray(b.types) && b.types.length
      ? b.types.join(', ')
      : 'local business';
  const rating =
    b.rating != null ? `${b.rating}/5 (${b.reviewCount} reviews)` : 'not rated yet';
  const phone = b.phone || 'not listed';

  return `You are an expert local business analyst. Write an engaging, highly contextual 4-5 sentence summary of this business. The tone should be professional yet highly approachable, designed to help a potential customer understand exactly why they should visit or contact them. Instead of generic descriptions, highlight what makes this specific business stand out based on their category and rating.
Business: ${b.name}
Category: ${category}
Location: ${b.address || 'address not listed'}
Rating: ${rating}
Phone: ${phone}
Context: This business operates locally without a dedicated website. Frame this as a strength (e.g., strong community presence, hands-on local service).
CRITICAL: Pick a unique, creative angle to describe them. Do not use generic filler.
Summary:`;
};

/**
 * POST /api/summary/:placeId  [protected]
 */
const generateSummary = async (req, res, next) => {
  try {
    const { placeId } = req.params;
    if (!placeId || placeId.length < 5) {
      return res
        .status(400)
        .json({ success: false, message: 'A valid placeId is required.' });
    }

    logEvent(req, 'ai_summary', { target: placeId });

    // Serve a cached summary if we have one.
    const forceRefresh = req.query.force === 'true';
    const cachedSummary = !forceRefresh ? summaryCache.get(`summary:${placeId}`) : null;
    if (cachedSummary) {
      return res.json({
        success: true,
        summary: cachedSummary,
        model: MODEL_LABEL(),
        placeId,
        cached: true,
      });
    }

    // Reuse the business detail cache from the business controller.
    let business;
    try {
      business = await getDetailCached(placeId);
    } catch (err) {
      if (err instanceof GoogleMapsError) {
        return res.status(err.statusCode).json({
          success: false,
          message: 'Could not load business details to summarize.',
        });
      }
      throw err;
    }

    if (!business) {
      return res
        .status(404)
        .json({ success: false, message: 'Business not found.' });
    }

    const prompt = buildPrompt(business);
    // Returns null when GROQ_API_KEY is unset or the call fails — degrade gracefully.
    // Use a higher temperature for variety
    const summary = await aiService.callLlm(prompt, { timeout: 60000, maxTokens: 400, temperature: 0.85 });

    if (!summary) {
      return res.json({
        success: true,
        summary: null,
        fallback: true,
        message: FALLBACK_MESSAGE,
        placeId,
      });
    }

    summaryCache.set(`summary:${placeId}`, summary);

    return res.json({
      success: true,
      summary,
      model: MODEL_LABEL(),
      placeId,
      cached: false,
    });
  } catch (err) {
    return next(err);
  }
};

/* ---------------------------------------------------------------------------
 * Cold outreach message generator (English / Marathi / Manglish)
 * ------------------------------------------------------------------------- */

/**
 * Professional, WEBSITE-AWARE fallback templates (used when the LLM is
 * unavailable, and to fill any language the LLM skips). The pitch adapts to
 * whether the business already has a website.
 */
const buildOutreachFallback = (b) => {
  const name = b.name || 'there';
  const hasWebsite = !!b.website;
  const rEn =
    b.rating != null
      ? `your ${b.rating}★ rating${b.reviewCount ? ` across ${b.reviewCount}+ reviews` : ''}`
      : 'your strong local reputation';
  const rMr =
    b.rating != null
      ? `तुमचं ${b.rating}★ रेटिंग${b.reviewCount ? ` (${b.reviewCount}+ रिव्ह्यू)` : ''}`
      : 'तुमची स्थानिक प्रतिष्ठा';
  const rMx =
    b.rating != null
      ? `tumcha ${b.rating}★ rating${b.reviewCount ? ` (${b.reviewCount}+ reviews)` : ''}`
      : 'tumchi local reputation';

  if (hasWebsite) {
    return {
      english: `Hi ${name} team, 👋 I came across your business on Google Maps and ${rEn} genuinely stands out — you've clearly earned your customers' trust. I help local businesses turn that reputation into more enquiries online: a faster, modern website, stronger visibility when people search on Google, and simple online booking/ordering so no lead slips away. I have a couple of specific ideas for a business like yours. Would you be open to a quick 10-minute call this week to see if it's a fit?`,
      marathi: `नमस्कार ${name} टीम, 👋 मी तुमचा व्यवसाय Google Maps वर पाहिला आणि ${rMr} खरोखर उठून दिसतं — तुम्ही ग्राहकांचा विश्वास कमावला आहे. मी स्थानिक व्यवसायांना त्यांच्या प्रतिष्ठेचं रूपांतर अधिक ऑनलाइन ग्राहकांमध्ये करण्यास मदत करतो: वेगवान आधुनिक वेबसाइट, Google सर्चवर चांगली दृश्यमानता आणि सोपी ऑनलाइन बुकिंग/ऑर्डर. तुमच्यासारख्या व्यवसायासाठी माझ्याकडे काही खास कल्पना आहेत. या आठवड्यात १० मिनिटांच्या कॉलसाठी वेळ मिळेल का?`,
      manglish: `Namaskar ${name} team, 👋 Mi tumcha business Google Maps var baghitla ani ${rMx} kharach ustun dista — tumhi customers cha trust kamavla aahe. Mi local businesses na tyanchi reputation cha rupantar jaast online customers madhe karayla help karto: fast modern website, Google search var behtar visibility ani sopi online booking/order. Tumchya sarkhya business sathi majhyakade kahi khaas ideas aahet. Ya aathvdyat 10 minute chya call sathi vel milel ka?`,
      hindi: `नमस्ते ${name} टीम, 👋 मैंने Google Maps पर आपका बिज़नेस देखा और ${rEn} वाकई बहुत शानदार है — आपने ग्राहकों का असली भरोसा जीता है। मैं लोकल बिज़नेस को इसी भरोसे को ऑनलाइन एन्क्वायरी में बदलने में मदद करता हूँ: एक तेज़, मॉडर्न वेबसाइट, Google सर्च पर बेहतर विजिबिलिटी और आसान ऑनलाइन बुकिंग/ऑर्डर ताकि कोई भी लीड हाथ से न जाए। मेरे पास आपके जैसे बिज़नेस के लिए कुछ खास आइडिया हैं। क्या हम इस हफ्ते 10 मिनट बात कर सकते हैं?`,
      hinglish: `Namaste ${name} team, 👋 Maine Google Maps par aapka business dekha aur ${rEn} sach mein bahut shandaar hai — aapne customers ka asli trust jeeta hai. Main local businesses ko is trust ko aur zyada online enquiries mein badalne mein help karta hu: ek fast, modern website, Google search par better visibility aur aasan online booking/order. Mere paas aapke jaise business ke liye kuch khaas ideas hain. Kya hum is week 10 minute baat kar sakte hain?`,
    };
  }
  return {
    english: `Hi ${name} team, 👋 I found your business on Google Maps and ${rEn} is genuinely impressive — you've clearly built real trust locally. I noticed you don't have a website yet, which means customers searching online may be choosing competitors who do. I build professional, mobile-friendly websites that turn your Google reputation into calls, bookings and orders, so new customers can find and trust you 24/7. I'd be glad to show you a quick example tailored to your business. Could we have a short 10-minute chat this week?`,
    marathi: `नमस्कार ${name} टीम, 👋 मला तुमचा व्यवसाय Google Maps वर सापडला आणि ${rMr} खरोखर प्रभावी आहे — तुम्ही स्थानिक विश्वास कमावला आहे. मला दिसलं की तुमची अजून वेबसाइट नाही, त्यामुळे ऑनलाइन शोधणारे ग्राहक कदाचित वेबसाइट असलेल्या स्पर्धकांकडे जात असतील. मी व्यावसायिक, मोबाइल-फ्रेंडली वेबसाइट बनवतो ज्या तुमच्या Google प्रतिष्ठेचं रूपांतर कॉल, बुकिंग आणि ऑर्डरमध्ये करतात. तुमच्यासाठी खास एक उदाहरण दाखवायला आवडेल. या आठवड्यात १० मिनिटं बोलू शकतो का?`,
    manglish: `Namaskar ${name} team, 👋 Mala tumcha business Google Maps var sapadla ani ${rMx} kharach impressive aahe — tumhi local trust kamavla aahe. Mala disla ki tumchi ajun website nahi, mhanun online search karnare customers kadachit website aslelya competitors kade jat astil. Mi professional, mobile-friendly website banavto jya tumchya Google reputation cha rupantar calls, bookings ani orders madhe kartat. Tumchya sathi khaas ek example dakhvayla avdel. Ya aathvdyat 10 minute bolu shakto ka?`,
    hindi: `नमस्ते ${name} टीम, 👋 मुझे Google Maps पर आपका बिज़नेस मिला और ${rEn} वाकई बहुत इम्प्रेसिव है — आपने लोकली बहुत अच्छा ट्रस्ट बनाया है। मैंने देखा कि आपकी अभी कोई वेबसाइट नहीं है, जिसका मतलब है कि ऑनलाइन सर्च करने वाले कस्टमर्स शायद उन कॉम्पिटिटर्स के पास जा रहे हैं जिनकी वेबसाइट है। मैं प्रोफेशनल, मोबाइल-फ्रेंडली वेबसाइट्स बनाता हूँ जो आपकी Google रेपुटेशन को कॉल्स, बुकिंग्स और ऑर्डर्स में बदलती हैं। मैं आपको आपके बिज़नेस के लिए एक बेहतरीन सैंपल दिखाना चाहूँगा। क्या हम इस हफ्ते 10 मिनट बात कर सकते हैं?`,
    hinglish: `Namaste ${name} team, 👋 Mujhe Google Maps par aapka business mila aur ${rEn} sach mein bahut impressive hai — aapne locally bahut accha trust banaya hai. Maine dekha ki aapki abhi koi website nahi hai, jiska matlab hai ki online search karne wale customers shayad un competitors ke paas jaa rahe hain jinki website hai. Main professional, mobile-friendly websites banata hu jo aapki Google reputation ko calls, bookings aur orders mein badalti hain. Main aapko aapke business ke liye ek badhiya example dikhana chahunga. Kya hum is week 10 minute baat kar sakte hain?`,
  };
};

/** Prompt the LLM for all three languages in a parseable format. */
const buildOutreachPrompt = (b) => {
  const hasWebsite = !!b.website;
  const category =
    Array.isArray(b.types) && b.types.length
      ? b.types.slice(0, 4).join(', ')
      : 'local business';
  const rating =
    b.rating != null
      ? `${b.rating}/5${b.reviewCount ? ` from ${b.reviewCount} reviews` : ''}`
      : 'a strong local reputation';
  const situation = hasWebsite
    ? `They ALREADY HAVE a website (${b.website}). Do NOT say or imply they lack one. Offer to help them get MORE customers from their online presence — a faster, modern redesign, better visibility on Google search, and simple online booking/ordering/enquiries.`
    : `They do NOT have a website. Offer to build them a professional, mobile-friendly website that converts their strong Google presence into calls, bookings and orders, and helps new customers find and trust them.`;

  return `You are a digital strategist writing a bespoke, professional outreach message to a local business owner. Your goal is to establish credibility and sound authoritative, but you must use extremely simple, everyday language. The pitch must feel deeply contextual and highly professional, but completely accessible.

Business name: ${b.name}
Category: ${category}
Google rating: ${rating}
Situation: ${situation}

Guidelines:
- Length: Strictly 140-160 words. The message MUST be detailed, pinpoint precise, and well fleshed out depending upon the data and approach. Do NOT write short 3-sentence messages.
- Tone & Vocabulary: Strictly professional but use VERY SIMPLE, everyday spoken words. Do not use complex vocabulary, big words, or corporate jargon that a local shop owner might find unnatural.
- Language Style (CRITICAL): For all 5 versions, write exactly how people ACTUALLY speak in daily life. Do NOT use pure, literary, or textbook grammar. The sentence structure must feel logical, conversational, and deeply native. Do not just literally translate English syntax into Marathi/Hindi.
- Formatting (CRITICAL): Use normal sentence casing. DO NOT use weird camelCase or random capitalized letters in the middle of words (like 'tumchyA' or 'mAlhAr'). Just type naturally like a human texting.
- CRITICAL: Pick ONE highly specific, completely unique creative angle for this pitch (e.g., focus deeply on their specific cuisine if a restaurant, or their specific service quality). Do NOT use generic business platitudes. 
- Start by acknowledging their specific niche (${category}) and their impressive local reputation (${rating}). Make the compliment feel deeply authentic.
- Gently pivot to the opportunity. Suggest a collaborative idea to help them capture more of the market they already dominate. 
- Focus on real, tangible value: saving time, looking more professional, or capturing lost leads. Explain the "why" simply.
- The call to action must be low-pressure and professional (e.g., "Would you be open to a brief 10-minute introductory call?").

Write FIVE versions and return them EXACTLY in this format with these markers and nothing else:
[EN]
<the message in professional English>
[MR]
<the same message in natural, logically structured Marathi, in Devanagari script>
[MX]
<the message in Manglish: Marathi written in Latin letters, with native sentence structure>
[HI]
<the message in natural, logically structured Hindi, in Devanagari script>
[HX]
<the message in Hinglish: Hindi written in Latin letters, with native sentence structure>`;
};

/** Parse the [EN]/[MR]/[MX] sections out of the model output. */
const parseOutreach = (text) => {
  const grab = (tag, nexts) => {
    const re = new RegExp(
      `\\[${tag}\\]([\\s\\S]*?)(?=${nexts.map((n) => `\\[${n}\\]`).join('|')}|$)`,
      'i'
    );
    const m = re.exec(text);
    return m && m[1] ? m[1].trim() : '';
  };
  const result = {
    english: grab('EN', ['MR', 'MX', 'HI', 'HX']),
    marathi: grab('MR', ['EN', 'MX', 'HI', 'HX']),
    manglish: grab('MX', ['EN', 'MR', 'HI', 'HX']),
    hindi: grab('HI', ['EN', 'MR', 'MX', 'HX']),
    hinglish: grab('HX', ['EN', 'MR', 'MX', 'HI']),
  };
  if (!result.english && !result.marathi && !result.manglish && !result.hindi && !result.hinglish) return null;
  return result;
};

/**
 * POST /api/summary/:placeId/outreach  [protected]
 * Returns cold outreach messages in English, Marathi and Manglish.
 * Falls back to high-quality templates if Ollama is unavailable.
 */
const generateOutreach = async (req, res, next) => {
  try {
    const { placeId } = req.params;
    if (!placeId || placeId.length < 5) {
      return res
        .status(400)
        .json({ success: false, message: 'A valid placeId is required.' });
    }

    logEvent(req, 'ai_outreach', { target: placeId });

    const cacheKey = `outreach:${placeId}`;
    const forceRefresh = req.query.force === 'true';
    const cachedMessages = !forceRefresh ? summaryCache.get(cacheKey) : null;
    if (cachedMessages) {
      return res.json({
        success: true,
        messages: cachedMessages.messages,
        fallback: cachedMessages.fallback,
        cached: true,
        placeId,
      });
    }

    let business;
    try {
      business = await getDetailCached(placeId);
    } catch (err) {
      if (err instanceof GoogleMapsError) {
        return res.status(err.statusCode).json({
          success: false,
          message: 'Could not load business details for outreach.',
        });
      }
      throw err;
    }

    if (!business) {
      return res
        .status(404)
        .json({ success: false, message: 'Business not found.' });
    }

    const fallback = buildOutreachFallback(business);

    let messages = fallback;
    let usedFallback = true;

    // Returns null when unconfigured/unreachable — keep the template fallback.
    // Three ~200-word messages need headroom, and we use a high temperature to guarantee varied, creative outputs on regenerate.
    const raw = await aiService.callLlm(buildOutreachPrompt(business), {
      timeout: 60000,
      maxTokens: 1800,
      temperature: 0.85,
    });
    const parsed = raw ? parseOutreach(raw) : null;
    if (parsed) {
      // Use the model where it produced output; fill gaps with templates.
      messages = {
        english: parsed.english || fallback.english,
        marathi: parsed.marathi || fallback.marathi,
        manglish: parsed.manglish || fallback.manglish,
        hindi: parsed.hindi || fallback.hindi,
        hinglish: parsed.hinglish || fallback.hinglish,
      };
      usedFallback = false;
    }

    summaryCache.set(cacheKey, { messages, fallback: usedFallback });

    return res.json({
      success: true,
      messages,
      fallback: usedFallback,
      model: usedFallback ? null : MODEL_LABEL(),
      placeId,
      cached: false,
    });
  } catch (err) {
    return next(err);
  }
};

/* ---------------------------------------------------------------------------
 * Review insights — summary + aspect sentiment chips
 * ------------------------------------------------------------------------- */

// Generic, cross-vertical aspects. Later phases can swap in vertical-specific
// aspects (e.g. "photos match reality" for apparel, "genuine parts" for auto).
const ASPECTS = [
  { key: 'quality', label: 'Quality' },
  { key: 'value', label: 'Value for money' },
  { key: 'service', label: 'Service' },
  { key: 'reliability', label: 'Reliability' },
];

const SENTIMENTS = ['positive', 'mixed', 'negative', 'unknown'];

/** Build a prompt that asks the model to summarize reviews + rate each aspect. */
const buildInsightsPrompt = (business, reviews) => {
  const reviewText = reviews
    .map(
      (r, i) =>
        `Review ${i + 1} (${r.rating != null ? `${r.rating}/5` : 'no rating'}): ${
          (r.text || '').slice(0, 400) || '(no text)'
        }`
    )
    .join('\n');

  const aspectLines = ASPECTS.map((a) => `${a.key}: <positive|mixed|negative|unknown>`).join('\n');

  return `You are a nuanced consumer insights analyst. Your task is to analyze these customer reviews and synthesize a highly perceptive, professional summary for prospective customers. Look beyond the obvious; identify the core reasons why customers love this place or what recurring friction points exist. 

Base every judgement ONLY on the reviews below — never invent facts. If the reviews say nothing about an aspect, mark it "unknown".

Business: ${business.name}
Reviews:
${reviewText}

Return EXACTLY this format and nothing else:
SUMMARY: <three to four highly insightful sentences detailing the true customer experience, avoiding generic filler, capturing the specific vibe of the place>
${aspectLines}`;
};

/** Parse the SUMMARY + aspect lines out of the model output. */
const parseInsights = (text) => {
  const summaryMatch = /SUMMARY:\s*([\s\S]*?)(?:\n[a-z_]+:|$)/i.exec(text);
  const summary = summaryMatch && summaryMatch[1] ? summaryMatch[1].trim() : '';

  const aspects = ASPECTS.map((a) => {
    const re = new RegExp(`${a.key}\\s*:\\s*(positive|mixed|negative|unknown)`, 'i');
    const m = re.exec(text);
    const sentiment = m ? m[1].toLowerCase() : 'unknown';
    return {
      key: a.key,
      label: a.label,
      sentiment: SENTIMENTS.includes(sentiment) ? sentiment : 'unknown',
    };
  });

  if (!summary && aspects.every((a) => a.sentiment === 'unknown')) return null;
  return { summary, aspects };
};

/**
 * POST /api/summary/:placeId/reviews  [protected]
 * Summarizes a business's Google reviews and returns aspect-sentiment chips.
 * Gracefully degrades when Ollama is unavailable or there are no reviews.
 */
const generateReviewInsights = async (req, res, next) => {
  try {
    const { placeId } = req.params;
    if (!placeId || placeId.length < 5) {
      return res
        .status(400)
        .json({ success: false, message: 'A valid placeId is required.' });
    }

    logEvent(req, 'review_insights', { target: placeId });

    const cacheKey = `insights:${placeId}`;
    const forceRefresh = req.query.force === 'true';
    const cached = !forceRefresh ? summaryCache.get(cacheKey) : null;
    if (cached) {
      return res.json({ success: true, ...cached, cached: true, placeId });
    }

    let business;
    try {
      business = await getDetailCached(placeId);
    } catch (err) {
      if (err instanceof GoogleMapsError) {
        return res.status(err.statusCode).json({
          success: false,
          message: 'Could not load business details to analyze reviews.',
        });
      }
      throw err;
    }

    if (!business) {
      return res
        .status(404)
        .json({ success: false, message: 'Business not found.' });
    }

    const reviews = Array.isArray(business.reviews) ? business.reviews : [];
    if (reviews.length === 0) {
      const payload = {
        available: false,
        message: 'No Google reviews are available to analyze yet.',
      };
      // Safe to cache: "no reviews" is stable for the detail cache lifetime.
      summaryCache.set(cacheKey, payload);
      return res.json({ success: true, ...payload, cached: false, placeId });
    }

    const raw = await aiService.callLlm(buildInsightsPrompt(business, reviews), {
      timeout: 60000,
      maxTokens: 500,
      temperature: 0.85,
    });
    const parsed = raw ? parseInsights(raw) : null;

    if (!parsed) {
      // Fallback: no summary, but do NOT fabricate sentiment — mark all unknown.
      const payload = {
        available: true,
        fallback: true,
        summary: null,
        aspects: ASPECTS.map((a) => ({ ...a, sentiment: 'unknown' })),
        message:
          'AI review insights unavailable — set GROQ_API_KEY on the server for aspect analysis.',
      };
      return res.json({ success: true, ...payload, cached: false, placeId });
    }

    const payload = { available: true, fallback: false, ...parsed };
    summaryCache.set(cacheKey, payload);
    return res.json({ success: true, ...payload, cached: false, placeId });
  } catch (err) {
    return next(err);
  }
};

module.exports = { generateSummary, generateOutreach, generateReviewInsights };
