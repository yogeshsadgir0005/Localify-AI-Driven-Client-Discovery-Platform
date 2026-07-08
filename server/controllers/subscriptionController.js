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
  topup_ai_5: { amount: 9900, name: '5 AI Website Credits', credits: 5 }, // 99 INR
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

    const keyId = process.env.RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

    const isPlaceholder = (val) => !val || val === 'dummy_key' || val === 'dummy_secret' || val.includes('your_') || val.includes('placeholder');

    if (isPlaceholder(keyId) || isPlaceholder(keySecret)) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway is not configured on the server.',
      });
    }

    const options = {
      amount: PLANS[plan].amount,
      currency: 'INR',
      receipt: `rcpt_${req.user.id.slice(-6)}_${Date.now()}`,
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
    console.error('Razorpay Error:', err);
    const errorMsg = err.error ? err.error.description : err.message;
    return res.status(500).json({ success: false, message: `Razorpay Error: ${errorMsg}` });
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

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ success: false, message: 'Payment gateway is not configured on the server.' });
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

/**
 * POST /api/subscriptions/create-topup-order [protected]
 */
exports.createTopUpOrder = async (req, res, next) => {
  try {
    const { packageId } = req.body; 

    if (!PLANS[packageId] || !PLANS[packageId].credits) {
      return res.status(400).json({ success: false, message: 'Invalid top-up package selected' });
    }

    const keyId = process.env.RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

    const isPlaceholder = (val) => !val || val === 'dummy_key' || val === 'dummy_secret' || val.includes('your_') || val.includes('placeholder');

    if (isPlaceholder(keyId) || isPlaceholder(keySecret)) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway is not configured on the server.',
      });
    }

    const options = {
      amount: PLANS[packageId].amount,
      currency: 'INR',
      receipt: `topup_${req.user.id.slice(-6)}_${Date.now()}`,
      notes: {
        packageId,
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
    console.error('Razorpay Error:', err);
    const errorMsg = err.error ? err.error.description : err.message;
    return res.status(500).json({ success: false, message: `Razorpay Error: ${errorMsg}` });
  }
};

/**
 * POST /api/subscriptions/verify-topup [protected]
 */
exports.verifyTopUpPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, packageId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !packageId) {
      return res.status(400).json({ success: false, message: 'Missing payment verification details' });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ success: false, message: 'Payment gateway is not configured.' });
    }

    // Verify signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generated_signature = hmac.digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed (signature mismatch)' });
    }

    // Add credits to user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const creditsToAdd = PLANS[packageId].credits || 0;
    
    if (!user.aiQuota) user.aiQuota = { usage: 0, extraCredits: 0, resetAt: null };
    if (!user.aiQuota.extraCredits) user.aiQuota.extraCredits = 0;
    
    user.aiQuota.extraCredits += creditsToAdd;
    await user.save();

    res.json({
      success: true,
      message: `Successfully added ${creditsToAdd} AI Website Generation Credits!`,
      user: user.toSafeObject(),
    });
  } catch (err) {
    next(err);
  }
};
