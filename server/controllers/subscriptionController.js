const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key', // Fallback to prevent crash on init if missing
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
});

const PLANS = {
  pro: { amount: 19900, name: 'Pro Plan' }, // amounts in paise (199 INR)
  max: { amount: 49900, name: 'Max Plan' }, // 499 INR
};

/**
 * POST /api/subscriptions/create-order [protected]
 */
exports.createOrder = async (req, res, next) => {
  try {
    const { plan } = req.body; // 'pro' or 'max'

    if (!PLANS[plan]) {
      return res.status(400).json({ success: false, message: 'Invalid plan selected' });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('Razorpay keys missing in environment variables.');
      return res.status(500).json({ success: false, message: 'Payment gateway not configured' });
    }

    const options = {
      amount: PLANS[plan].amount,
      currency: 'INR',
      receipt: `receipt_${req.user.id}_${Date.now()}`,
      notes: {
        plan,
        userId: req.user.id,
      },
    };

    const order = await razorpay.orders.create(options);
    
    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/subscriptions/verify-payment [protected]
 */
exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan) {
      return res.status(400).json({ success: false, message: 'Missing payment verification details' });
    }

    // Verify signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generated_signature = hmac.digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed (signature mismatch)' });
    }

    // Upgrade user plan
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Grant 30 days of access
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    user.plan = plan;
    user.subscriptionExpiry = expiryDate;
    
    // Reset location change count as a courtesy on upgrade
    user.locationChanges = { count: 0, resetAt: new Date() };

    await user.save();

    res.json({
      success: true,
      message: `Successfully upgraded to ${PLANS[plan].name}!`,
      user: user.toSafeObject(),
    });
  } catch (err) {
    next(err);
  }
};
