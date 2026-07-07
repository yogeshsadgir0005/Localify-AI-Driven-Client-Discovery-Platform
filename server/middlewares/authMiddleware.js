const jwt = require('jsonwebtoken');

/**
 * Protect routes by verifying a Bearer JWT.
 * On success attaches { id, email, name } to req.user.
 * On failure responds with 401 and a machine-readable reason.
 */
const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. No token provided.',
    });
  }

  const token = header.slice(7).trim();
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. No token provided.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
    };
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        expired: true,
        message: 'Session expired. Please log in again.',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token.',
    });
  }
};

module.exports = authMiddleware;
