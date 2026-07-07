const express = require('express');
const {
  searchBusinesses,
  getBusinessDetail,
  getBusinessPhoto,
} = require('../controllers/businessController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// Public: image proxy for Google Place photos (<img> tags can't send a token).
// Declared before the auth guard and before the /:placeId param route.
router.get('/photo', getBusinessPhoto);

// Everything below requires authentication.
router.use(authMiddleware);

router.get('/search', searchBusinesses);
router.get('/:placeId', getBusinessDetail);

module.exports = router;
