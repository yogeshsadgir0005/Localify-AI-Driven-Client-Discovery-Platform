const express = require('express');
const {
  register,
  verifySignupOtp,
  login,
  googleAuth,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  updateAddress,
  getProfile,
  getConsents,
  updateConsent,
  listSavedSearches,
  addSavedSearch,
  deleteSavedSearch,
  unhidePhone,
} = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const { authLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

// Public auth endpoints are rate-limited more strictly.
router.post('/register', authLimiter, register);
router.post('/verify-signup-otp', authLimiter, verifySignupOtp);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleAuth);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/verify-reset-otp', authLimiter, verifyResetOtp);
router.post('/reset-password', authLimiter, resetPassword);

// Protected.
router.put('/update-address', authMiddleware, updateAddress);
router.get('/profile', authMiddleware, getProfile);
router.get('/consent', authMiddleware, getConsents);
router.put('/consent', authMiddleware, updateConsent);
router.get('/saved-searches', authMiddleware, listSavedSearches);
router.post('/saved-searches', authMiddleware, addSavedSearch);
router.delete('/saved-searches/:id', authMiddleware, deleteSavedSearch);
router.post('/unhide-phone', authMiddleware, unhidePhone);

module.exports = router;
