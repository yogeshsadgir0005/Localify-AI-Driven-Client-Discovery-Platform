const express = require('express');
const {
  register,
  login,
  googleAuth,
  forgotPassword,
  resetPassword,
  updateAddress,
  getProfile,
  getConsents,
  updateConsent,
  listSavedSearches,
  addSavedSearch,
  deleteSavedSearch,
} = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const { authLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

// Public auth endpoints are rate-limited more strictly.
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleAuth);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);

// Protected.
router.put('/update-address', authMiddleware, updateAddress);
router.get('/profile', authMiddleware, getProfile);
router.get('/consent', authMiddleware, getConsents);
router.put('/consent', authMiddleware, updateConsent);
router.get('/saved-searches', authMiddleware, listSavedSearches);
router.post('/saved-searches', authMiddleware, addSavedSearch);
router.delete('/saved-searches/:id', authMiddleware, deleteSavedSearch);

module.exports = router;
