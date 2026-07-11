const GeneratedWebsite = require('../models/GeneratedWebsite');
const User = require('../models/User');
const { analyzeBusinessImages } = require('../services/aiService');
const { generateAgenticWebsite, fixWebsiteBugs, analyzeBugScreenshot } = require('../services/websiteGenerator');
const { getDetailCached } = require('./businessController');
const { placePhoto } = require('../utils/googleMaps');
const { logEvent } = require('../utils/telemetry');

const PLAN_LIMITS = {
  free: 0,
  pro: 3,
  max: 9,
};

// Guards against concurrent generations for the SAME business. A double-fired
// request (React StrictMode, double-click, two tabs, retries) would otherwise
// run two full pipelines that race to write the same record — the "two different
// section sets" bug. Only ONE generation per placeId runs at a time.
const generationsInFlight = new Set();

const getWebsite = async (req, res, next) => {
  try {
    const { placeId } = req.params;
    const website = await GeneratedWebsite.findOne({ placeId }).lean();

    if (!website) {
      return res.status(404).json({ success: false, message: 'Website not found for this business.' });
    }

    return res.json({ success: true, pages: website.pages, surveyContext: website.surveyContext });
  } catch (err) {
    return next(err);
  }
};

const generateWebsite = async (req, res, next) => {
  let acquiredLock = false;
  let placeIdForLock = null;
  try {
    const { placeId } = req.params;
    const { survey } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const plan = user.plan || 'free';
    const limit = PLAN_LIMITS[plan] || 0;

    // Reset weekly limit logic
    const now = new Date();
    if (!user.aiQuota.resetAt || now > user.aiQuota.resetAt) {
      user.aiQuota.usage = 0;
      const nextWeek = new Date();
      nextWeek.setDate(now.getDate() + 7);
      user.aiQuota.resetAt = nextWeek;
    }

    // Check quota, bypass if admin
    const isAdmin = user.roles && user.roles.includes('admin');
    if (!isAdmin && user.aiQuota.usage >= limit && user.aiQuota.extraCredits <= 0) {
      return res.status(403).json({
        success: false,
        message: 'You have reached your AI website generation limit. Please top up your credits.',
        code: 'QUOTA_EXCEEDED'
      });
    }

    // Get business details for context
    const business = await getDetailCached(placeId);
    if (!business) {
      return res.status(404).json({ success: false, message: 'Business not found.' });
    }

    // ONE generation per business at a time — reject a concurrent duplicate so we
    // never run two racing pipelines (the "two different section sets" bug).
    if (generationsInFlight.has(placeId)) {
      return res.status(409).json({
        success: false,
        message: 'A website is already being generated for this business. Please wait for it to finish.',
        code: 'ALREADY_GENERATING',
      });
    }
    generationsInFlight.add(placeId);
    acquiredLock = true;
    placeIdForLock = placeId;

    // Process images for Vision LLM
    const photoUrls = [];
    if (business.photos && business.photos.length > 0) {
      // Fetch up to 2 photos to save bandwidth and LLM tokens
      const refs = business.photos.slice(0, 2).map(p => p.ref);
      for (const ref of refs) {
        try {
          const { contentType, data } = await placePhoto(ref, 600);
          const base64 = data.toString('base64');
          photoUrls.push(`data:${contentType};base64,${base64}`);
        } catch (e) {
          console.error('[websiteController] Failed to fetch photo for vision:', e.message);
        }
      }
    }

    const isStream = req.query.stream === 'true';
    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
    }

    const onProgress = (data) => {
      if (isStream) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        if (res.flush) res.flush(); // Flush compression buffer
      }
    };

    let heartbeatInterval;
    if (isStream) {
      heartbeatInterval = setInterval(() => {
        res.write(`data: ${JSON.stringify({ ping: true })}\n\n`);
        if (res.flush) res.flush();
      }, 15000); // Send heartbeat every 15s to keep connection alive
      
      onProgress({ status: 'Init', message: 'Analyzing business images & reviews...', progress: 5 });
    }
    
    const brandContext = await analyzeBusinessImages(photoUrls);

    // Generate with AI
    const existingWebsite = await GeneratedWebsite.findOne({ placeId });
    const result = await generateAgenticWebsite(business, survey, brandContext, onProgress, existingWebsite);
    
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    if (!result || !result.pages || !result.pages.html) {
      if (isStream) {
        res.write(`data: ${JSON.stringify({ error: 'AI failed to generate a complete website. Please try again.' })}\n\n`);
        return res.end();
      }
      return res.status(500).json({ success: false, message: 'AI failed to generate a complete website. Please try again.' });
    }

    // Deduct quota if not admin
    if (!isAdmin) {
      if (user.aiQuota.usage < limit) {
        user.aiQuota.usage += 1;
      } else {
        user.aiQuota.extraCredits -= 1;
      }
      await user.save();
    }

    // Save to DB
    const updatedWebsite = await GeneratedWebsite.findOneAndUpdate(
      { placeId },
      {
        placeId,
        ownerId: user._id,
        pages: result.pages,
        surveyContext: survey,
        intermediateSpecs: result.intermediateSpecs,
        qualityScores: result.qualityScores,
        qaReports: result.qaReports,
        pipelineMetrics: result.pipelineMetrics,
        promptVersion: result.promptVersion,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try {
      logEvent(req, 'generate_website', { target: placeId, meta: { plan } });
    } catch (e) {}

    if (isStream) {
      res.write(`data: ${JSON.stringify({ status: 'Done', placeId })}\n\n`);
      return res.end();
    }
    return res.json({ success: true, message: 'Website generated successfully!', website: updatedWebsite });
  } catch (err) {
    console.error('[websiteController] Generation Error:', err);
    const isStream = req.query.stream === 'true';
    if (isStream) {
      res.write(`data: ${JSON.stringify({ error: 'Server error during generation.' })}\n\n`);
      return res.end();
    }
    return next(err);
  } finally {
    if (acquiredLock && placeIdForLock) generationsInFlight.delete(placeIdForLock);
  }
};

const changeTheme = async (req, res, next) => {
  try {
    const { placeId } = req.params;
    const { color } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const plan = user.plan || 'free';
    const limit = PLAN_LIMITS[plan] || 0;

    // Check quota, bypass if admin
    const isAdmin = user.roles && user.roles.includes('admin');
    if (!isAdmin && user.aiQuota.usage >= limit && user.aiQuota.extraCredits <= 0) {
      return res.status(403).json({
        success: false,
        message: 'You have reached your AI website generation limit. Please top up your credits.',
        code: 'QUOTA_EXCEEDED'
      });
    }

    const website = await GeneratedWebsite.findOne({ placeId });
    if (!website) {
      return res.status(404).json({ success: false, message: 'Website not found.' });
    }

    const business = await getDetailCached(placeId);
    
    // Regenerate with new color
    const newSurvey = { ...website.surveyContext, color };
    const result = await generateAgenticWebsite(business, newSurvey, { color }, null, website);
    
    if (!result || !result.pages || !result.pages.html) {
      return res.status(500).json({ success: false, message: 'Failed to regenerate theme.' });
    }

    // Deduct quota if not admin
    if (!isAdmin) {
      if (user.aiQuota.usage < limit) {
        user.aiQuota.usage += 1;
      } else {
        user.aiQuota.extraCredits -= 1;
      }
      await user.save();
    }

    website.pages = result.pages;
    website.surveyContext = newSurvey;
    website.intermediateSpecs = result.intermediateSpecs;
    website.qualityScores = result.qualityScores;
    website.qaReports = result.qaReports;
    website.pipelineMetrics = result.pipelineMetrics;
    website.promptVersion = result.promptVersion;
    await website.save();

    return res.json({ success: true, message: 'Theme updated successfully!', website });
  } catch (err) {
    return next(err);
  }
};

/**
 * saveCode — persist manual edits to the generated HTML. FREE (no credits).
 * Owner (or admin) only.
 */
const saveCode = async (req, res, next) => {
  try {
    const { placeId } = req.params;
    const { html } = req.body;

    if (typeof html !== 'string' || html.trim().length < 50) {
      return res.status(400).json({ success: false, message: 'Invalid or empty HTML.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const website = await GeneratedWebsite.findOne({ placeId });
    if (!website) return res.status(404).json({ success: false, message: 'Website not found.' });

    const isAdmin = user.roles && user.roles.includes('admin');
    if (!isAdmin && String(website.ownerId) !== String(user._id)) {
      return res.status(403).json({ success: false, message: 'You do not own this website.' });
    }

    website.pages = { ...(website.pages || {}), html };
    await website.save();

    return res.json({ success: true, message: 'Changes saved.', pages: website.pages });
  } catch (err) {
    return next(err);
  }
};

/**
 * fixBugs — AI repairs ONLY the specific issues the user describes, leaving the
 * rest of the page intact. Costs 1 generation credit (manual edits are free).
 */
const fixBugs = async (req, res, next) => {
  try {
    const { placeId } = req.params;
    const { bugs, image } = req.body;

    const hasImage = typeof image === 'string' && image.startsWith('data:image/');
    if ((typeof bugs !== 'string' || bugs.trim().length < 4) && !hasImage) {
      return res.status(400).json({ success: false, message: 'Please describe the bug(s) or attach a screenshot.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const website = await GeneratedWebsite.findOne({ placeId });
    if (!website) return res.status(404).json({ success: false, message: 'Website not found.' });

    const isAdmin = user.roles && user.roles.includes('admin');
    if (!isAdmin && String(website.ownerId) !== String(user._id)) {
      return res.status(403).json({ success: false, message: 'You do not own this website.' });
    }

    const plan = user.plan || 'free';
    const limit = PLAN_LIMITS[plan] || 0;

    // Reset weekly quota window if elapsed.
    const now = new Date();
    if (!user.aiQuota.resetAt || now > user.aiQuota.resetAt) {
      user.aiQuota.usage = 0;
      const nextWeek = new Date();
      nextWeek.setDate(now.getDate() + 7);
      user.aiQuota.resetAt = nextWeek;
    }

    if (!isAdmin && user.aiQuota.usage >= limit && user.aiQuota.extraCredits <= 0) {
      return res.status(403).json({
        success: false,
        message: 'You have no AI credits left. Please top up to use AI bug fixes.',
        code: 'QUOTA_EXCEEDED',
      });
    }

    const currentHtml = website.pages && website.pages.html;
    if (!currentHtml) {
      return res.status(400).json({ success: false, message: 'This website has no editable HTML.' });
    }

    // If a screenshot was attached, analyze it (vision) and fold the concrete
    // visual findings into the bug description. Degrades gracefully if vision
    // is unavailable — we still fix based on the text note.
    const note = (bugs || '').trim();
    let combinedBugs = note;
    if (hasImage) {
      const visual = await analyzeBugScreenshot(image, note);
      if (visual) {
        combinedBugs = `${note ? note + '\n\n' : ''}VISUAL ANALYSIS OF THE ATTACHED SCREENSHOT:\n${visual}`;
      } else if (!note) {
        return res.status(502).json({ success: false, message: 'Could not read the screenshot. Please add a short text description too. No credit was used.' });
      }
    }

    const fixed = await fixWebsiteBugs(currentHtml, combinedBugs);
    if (!fixed) {
      return res.status(502).json({ success: false, message: 'The AI could not apply a safe fix. No credit was used — please try rephrasing the bug.' });
    }

    // Only deduct AFTER a successful fix.
    if (!isAdmin) {
      if (user.aiQuota.usage < limit) user.aiQuota.usage += 1;
      else user.aiQuota.extraCredits -= 1;
      await user.save();
    }

    website.pages = { ...(website.pages || {}), html: fixed };
    await website.save();

    try { logEvent(req, 'fix_website', { target: placeId }); } catch (e) {}

    return res.json({ success: true, message: 'Bug fix applied.', pages: website.pages });
  } catch (err) {
    return next(err);
  }
};

module.exports = { getWebsite, generateWebsite, changeTheme, saveCode, fixBugs };
