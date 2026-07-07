const express = require('express');
const {
  getQueue,
  labelProfile,
  listDuplicates,
  mergeDuplicates,
  metrics,
  resolveAppeal,
} = require('../controllers/moderationController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

const router = express.Router();

// All moderation endpoints require an authenticated admin.
router.use(authMiddleware, adminMiddleware);

router.get('/queue', getQueue);
router.get('/duplicates', listDuplicates);
router.get('/metrics', metrics);
router.post('/merge', mergeDuplicates);
router.post('/appeal/:ticket/resolve', resolveAppeal);
router.post('/:id/label', labelProfile);

module.exports = router;
