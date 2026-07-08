const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const subscriptionController = require('../controllers/subscriptionController');

const router = express.Router();

router.post('/create-order', authMiddleware, subscriptionController.createOrder);
router.post('/verify-payment', authMiddleware, subscriptionController.verifyPayment);

// POST /api/subscriptions/create-topup-order
router.post('/create-topup-order', authMiddleware, subscriptionController.createTopUpOrder);

// POST /api/subscriptions/verify-topup
router.post('/verify-topup', authMiddleware, subscriptionController.verifyTopUpPayment);

module.exports = router;
