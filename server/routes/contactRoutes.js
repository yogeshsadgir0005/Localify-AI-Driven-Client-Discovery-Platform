const express = require('express');
const {
  createContactRequest,
  listMine,
  listIncoming,
  respond,
  confirmEngagement,
  getOne,
} = require('../controllers/contactController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.post('/', createContactRequest);
router.get('/', listMine);
router.get('/incoming', listIncoming); // before "/:id"
router.post('/:id/respond', respond);
router.post('/:id/confirm-engagement', confirmEngagement);
router.get('/:id', getOne);

module.exports = router;
