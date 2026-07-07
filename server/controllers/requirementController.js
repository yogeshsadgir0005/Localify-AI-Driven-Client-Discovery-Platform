const Requirement = require('../models/Requirement');
const aiService = require('../services/aiService');
const matchingService = require('../services/matchingService');
const notificationService = require('../services/notificationService');
const { logEvent } = require('../utils/telemetry');

/**
 * POST /api/requirements  [protected]
 * Body: { rawText, sellerKind?, geo?: {city,district,state} }
 * Captures a buyer need, parses it, and returns an initial shortlist.
 */
const createRequirement = async (req, res, next) => {
  try {
    const { rawText, sellerKind, geo } = req.body || {};
    if (!rawText || String(rawText).trim().length < 5) {
      return res.status(422).json({
        success: false,
        message: 'Please describe what you are looking for (at least 5 characters).',
      });
    }

    const parsed = await aiService.parseRequirement(rawText);
    if (geo && typeof geo === 'object') {
      parsed.geo = {
        city: geo.city || '',
        district: geo.district || '',
        state: geo.state || '',
      };
    }

    const requirement = await Requirement.create({
      buyer: req.user.id,
      rawText: String(rawText).trim(),
      sellerKind: ['business', 'freelancer'].includes(sellerKind) ? sellerKind : null,
      parsed,
    });

    logEvent(req, 'requirement_create', {
      target: requirement._id.toString(),
      meta: { vertical: parsed.vertical, parsedBy: parsed.parsedBy },
    });

    const matches = await matchingService.generateMatches(requirement, {
      explain: req.query.explain === '1',
    });
    logEvent(req, 'match_generate', {
      target: requirement._id.toString(),
      meta: { count: matches.length },
    });

    // Alert matched (claimed) sellers — the demand→supply half of the flywheel.
    await notificationService.notifyMatchingSellers(requirement, matches);

    return res.status(201).json({
      success: true,
      requirement: {
        id: requirement._id.toString(),
        rawText: requirement.rawText,
        parsed: requirement.parsed,
        status: requirement.status,
      },
      matches,
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/requirements  [protected] — the buyer's own requirements. */
const listMyRequirements = async (req, res, next) => {
  try {
    const requirements = await Requirement.find({ buyer: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, requirements });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/requirements/:id/matches  [protected] — regenerate the shortlist. */
const getMatches = async (req, res, next) => {
  try {
    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) {
      return res.status(404).json({ success: false, message: 'Requirement not found.' });
    }
    if (requirement.buyer.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not your requirement.' });
    }
    const matches = await matchingService.generateMatches(requirement, {
      explain: req.query.explain === '1',
    });
    logEvent(req, 'match_generate', {
      target: requirement._id.toString(),
      meta: { count: matches.length },
    });
    return res.json({ success: true, matches });
  } catch (err) {
    return next(err);
  }
};

module.exports = { createRequirement, listMyRequirements, getMatches };
