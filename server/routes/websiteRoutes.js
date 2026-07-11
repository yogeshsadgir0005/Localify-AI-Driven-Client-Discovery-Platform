const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const websiteController = require('../controllers/websiteController');

// GET /api/website/:placeId
router.get('/:placeId', websiteController.getWebsite);

// POST /api/website/:placeId/generate (Protected)
router.post('/:placeId/generate', authMiddleware, websiteController.generateWebsite);

// POST /api/website/:placeId/change-theme (Protected)
router.post('/:placeId/change-theme', authMiddleware, websiteController.changeTheme);

// PUT /api/website/:placeId/code — save manual code edits (Protected, free)
router.put('/:placeId/code', authMiddleware, websiteController.saveCode);

// POST /api/website/:placeId/fix — AI targeted bug fix (Protected, costs 1 credit)
router.post('/:placeId/fix', authMiddleware, websiteController.fixBugs);

module.exports = router;
