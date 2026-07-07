/**
 * 404 handler for unmatched routes.
 */
const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

/**
 * Centralized Express error handler.
 * Normalizes Mongoose, JWT and generic errors into a consistent shape.
 * Never leaks stack traces in production.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';

  // Mongoose validation error -> 422 with per-field messages.
  if (err.name === 'ValidationError') {
    const errors = {};
    Object.keys(err.errors).forEach((key) => {
      errors[key] = err.errors[key].message;
    });
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors,
    });
  }

  // Mongoose bad ObjectId / cast error.
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid value for field "${err.path}".`,
    });
  }

  // Mongoose duplicate key (unique index) error.
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || { field: '' })[0];
    const message =
      field === 'email'
        ? 'An account with this email already exists.'
        : `Duplicate value for "${field}".`;
    return res.status(409).json({
      success: false,
      message,
    });
  }

  // JWT errors that surface outside the auth middleware.
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token.',
    });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      expired: true,
      message: 'Session expired. Please log in again.',
    });
  }

  // Fallback.
  const status = err.statusCode || err.status || 500;
  const payload = {
    success: false,
    message:
      status === 500 && isProd
        ? 'Something went wrong. Please try again later.'
        : err.message || 'Internal server error.',
  };
  if (!isProd) {
    payload.stack = err.stack;
  }

  // Log server-side regardless of environment.
  if (status >= 500) {
    console.error('[error]', err);
  }

  return res.status(status).json(payload);
};

module.exports = { errorHandler, notFound };
