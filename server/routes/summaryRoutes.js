const express = require('express');
const {
  generateSummary,
  generateOutreach,
  generateReviewInsights,
} = require('../controllers/summaryController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/:placeId', authMiddleware, generateSummary);
router.post('/:placeId/outreach', authMiddleware, generateOutreach);
router.post('/:placeId/reviews', authMiddleware, generateReviewInsights);

module.exports = router;
