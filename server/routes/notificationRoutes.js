const express = require('express');
const {
  listNotifications,
  markRead,
  markAllRead,
} = require('../controllers/notificationController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/', listNotifications);
router.post('/read-all', markAllRead); // before "/:id/read"
router.post('/:id/read', markRead);

module.exports = router;
