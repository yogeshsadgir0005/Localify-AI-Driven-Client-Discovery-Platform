const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const subscriptionController = require('../controllers/subscriptionController');

const router = express.Router();

router.post('/create-order', authMiddleware, subscriptionController.createOrder);
router.post('/verify-payment', authMiddleware, subscriptionController.verifyPayment);

module.exports = router;
