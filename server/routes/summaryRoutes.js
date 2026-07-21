const express = require('express');
const {
  generateSummary,
  generateOutreach,
  generateReviewInsights,
} = require('../controllers/summaryController');
const authMiddleware = require('../middlewares/authMiddleware');
const requirePaidPlan = require('../middlewares/requirePaidPlan');

const router = express.Router();

// AI insight features are Pro/Max only (gated for both web + app).
router.post('/:placeId', authMiddleware, requirePaidPlan, generateSummary);
router.post('/:placeId/outreach', authMiddleware, requirePaidPlan, generateOutreach);
router.post('/:placeId/reviews', authMiddleware, requirePaidPlan, generateReviewInsights);

module.exports = router;
