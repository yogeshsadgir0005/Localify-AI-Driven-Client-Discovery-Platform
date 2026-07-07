const User = require('../models/User');

/**
 * Admin guard. Runs AFTER authMiddleware (needs req.user). Grants access if the
 * user has the 'admin' role, or their email is in the ADMIN_EMAILS allowlist
 * (comma-separated) — the bootstrap path before any admin role is assigned.
 */
const adminMiddleware = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const allowlist = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const user = await User.findById(req.user.id).select('roles email');
    const isAdmin =
      (user && Array.isArray(user.roles) && user.roles.includes('admin')) ||
      (user && allowlist.includes((user.email || '').toLowerCase()));

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = adminMiddleware;
