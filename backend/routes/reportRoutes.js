/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Report Routes (Admin Only)
   ========================================================================== */

const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requireRole(['ADMIN']));

router.get('/meals', reportController.getMealReport);

module.exports = router;
