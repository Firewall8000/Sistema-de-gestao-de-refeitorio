/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Auth Routes
   ========================================================================== */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.login);

module.exports = router;
