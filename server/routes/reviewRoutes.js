const express = require('express');
const { createReview, listForProfile } = require('../controllers/reviewController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// Public: published, contact-verified reviews for a profile.
router.get('/profile/:profileId', listForProfile);

// Protected: leave a review (only for a revealed connection).
router.post('/', authMiddleware, createReview);

module.exports = router;
