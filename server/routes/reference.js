const express = require('express');
const factors = require('../data/emissionFactors.json');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/reference/emission-factors
router.get('/emission-factors', authenticateToken, (req, res) => {
  try {
    res.json(factors);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve emission factors reference data.' });
  }
});

module.exports = router;
