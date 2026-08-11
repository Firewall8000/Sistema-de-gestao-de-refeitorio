/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Student Routes (RBAC Protected)
   ========================================================================== */

const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// Todas as rotas de alunos requerem autenticação JWT válida
router.use(requireAuth);

// Leitura de alunos: OPERATOR e ADMIN
router.get('/', studentController.getAllStudents);

// Modificações de alunos: EXCLUSIVAS PARA ADMIN
router.post('/', requireRole(['ADMIN']), studentController.createStudent);
router.patch('/:id/status', requireRole(['ADMIN']), studentController.toggleStudentStatus);
router.post('/:id/reissue-qr', requireRole(['ADMIN']), studentController.reissueQrCode);
router.delete('/:id', requireRole(['ADMIN']), studentController.softDeleteStudent);

module.exports = router;
