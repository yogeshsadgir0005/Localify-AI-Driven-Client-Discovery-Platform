const express = require('express');
const {
  getPrivacyNotice,
  getTerms,
  submitGrievance,
  submitAppeal,
} = require('../controllers/legalController');
const authMiddleware = require('../middlewares/authMiddleware');
const { authLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

// Public: the privacy notice + named grievance officer, and the terms summary.
router.get('/privacy', getPrivacyNotice);
router.get('/terms', getTerms);

// Public but strictly rate-limited: DPDP data-principal requests / grievances.
router.post('/grievance', authLimiter, submitGrievance);

// Protected: appeal a trust/verification decision (stub).
router.post('/appeal', authMiddleware, submitAppeal);

module.exports = router;
