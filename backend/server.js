/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Main Express Server Entry Point (Render Web Service Environment)
   ========================================================================== */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const { apiRateLimiter } = require('./middleware/rateLimiter');
const { globalErrorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const mealRoutes = require('./routes/mealRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();
const PORT = process.env.PORT || 10000;

// 1. Configurações de Segurança e Cors
app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origem não permitida pela política CORS.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Offline-Sync', 'X-Requested-With']
}));

app.use(express.json());
app.use(apiRateLimiter);

// 2. Rota de Health-Check Pública (Para Uptime do Render)
app.get('/api/health', (req, res) => {
  return res.status(200).json({
    status: 'UP',
    service: 'Santos Dumont Refectory API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 3. Modulos de Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/meals', mealRoutes);
app.use('/api/reports', reportRoutes);

// 4. Middleware Global para Tratar Rotas Não Encontradas (404)
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `A rota ${req.method} ${req.originalUrl} não foi encontrada na API.`
  });
});

// 5. Tratador Global de Erros da API
app.use(globalErrorHandler);

// 6. Iniciar Servidor escutando em 0.0.0.0 e PORT
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API Santos Dumont rodando na porta ${PORT} [0.0.0.0]`);
});
