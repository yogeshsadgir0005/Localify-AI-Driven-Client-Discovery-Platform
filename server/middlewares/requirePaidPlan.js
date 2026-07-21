const User = require('../models/User');

/**
 * Gate a route to paid subscribers (Pro/Max) or admins. Used for AI features
 * so free users get a clear "upgrade required" response on both web and app.
 */
module.exports = async function requirePaidPlan(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('plan roles').lean();
    const plan = user && user.plan;
    const isAdmin = user && Array.isArray(user.roles) && user.roles.includes('admin');
    if (isAdmin || plan === 'pro' || plan === 'max') return next();
    return res.status(403).json({
      success: false,
      code: 'UPGRADE_REQUIRED',
      message: 'AI features are available on the Pro and Max plans. Upgrade to unlock them.',
    });
  } catch (err) {
    return next(err);
  }
};
