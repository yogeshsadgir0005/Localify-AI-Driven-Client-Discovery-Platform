const express = require('express');
const { requireAuth } = require('../middlewares/authMiddleware');
const subscriptionController = require('../controllers/subscriptionController');

const router = express.Router();

router.post('/create-order', requireAuth, subscriptionController.createOrder);
router.post('/verify-payment', requireAuth, subscriptionController.verifyPayment);

module.exports = router;
