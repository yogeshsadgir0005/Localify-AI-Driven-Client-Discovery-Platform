const express = require('express');
const {
  createRequirement,
  listMyRequirements,
  getMatches,
} = require('../controllers/requirementController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.post('/', createRequirement);
router.get('/', listMyRequirements);
router.get('/:id/matches', getMatches);

module.exports = router;
