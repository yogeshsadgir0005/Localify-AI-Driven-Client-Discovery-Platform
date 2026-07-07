const express = require('express');
const {
  listProfiles,
  myProfiles,
  getProfile,
  createProfile,
  updateProfile,
  requestClaimOtp,
  verifyClaim,
  submitVerification,
  reportProfile,
  ingest,
} = require('../controllers/profileController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// Public browse/search.
router.get('/', listProfiles);

// Protected — declared before "/:id" so they aren't captured by the param route.
router.get('/mine', authMiddleware, myProfiles);
router.post('/', authMiddleware, createProfile);
router.post('/ingest', authMiddleware, ingest);

// Public profile view (contact withheld unless revealed via a ContactRequest).
router.get('/:id', getProfile);

// Owner actions.
router.put('/:id', authMiddleware, updateProfile);
router.post('/:id/claim/request', authMiddleware, requestClaimOtp);
router.post('/:id/claim/verify', authMiddleware, verifyClaim);
router.post('/:id/verify', authMiddleware, submitVerification);
router.post('/:id/report', authMiddleware, reportProfile);

module.exports = router;
