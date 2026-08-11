/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Meal Routes (Strict Rate Limited & Auth Protected)
   ========================================================================== */

const express = require('express');
const router = express.Router();
const mealController = require('../controllers/mealController');
const { requireAuth } = require('../middleware/authMiddleware');
const { strictRateLimiter } = require('../middleware/rateLimiter');

router.use(requireAuth);

router.post('/validate', strictRateLimiter, mealController.validateMeal);
router.get('/today-count', mealController.getTodayMealCount);

module.exports = router;
