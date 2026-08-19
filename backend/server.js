/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Main Express Server Entry Point
   ========================================================================== */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const { apiRateLimiter } = require('./middleware/rateLimiter');
const { globalErrorHandler } = require('./middleware/errorHandler');

const studentRoutes = require('./routes/studentRoutes');
const mealRoutes = require('./routes/mealRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();
const PORT = process.env.PORT || 10000;

/*
 * O Render encaminha as requisições através de um proxy.
 * Esta configuração permite que o rate limiter identifique o IP correto.
 */
app.set('trust proxy', 1);

/*
 * Segurança básica dos cabeçalhos HTTP.
 */
app.use(helmet());

/*
 * Origens autorizadas, separadas por vírgula.
 *
 * Exemplo:
 * CORS_ORIGINS=http://localhost:3000,https://preview.vercel.app
 */
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  throw new Error(
    'CORS_ORIGINS não foi configurada. O servidor não será iniciado.'
  );
}

const corsOptions = {
  origin(origin, callback) {
    /*
     * Requisições sem Origin incluem health checks,
     * ferramentas de servidor e alguns testes locais.
     */
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    const corsError = new Error(
      'Origem não permitida pela política CORS.'
    );

    corsError.status = 403;
    corsError.code = 'CORS_ORIGIN_DENIED';

    return callback(corsError);
  },

  credentials: false,

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS'
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With'
  ],

  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

/*
 * Limita o tamanho do JSON para evitar requisições excessivas.
 */
app.use(express.json({ limit: '100kb' }));

app.use(apiRateLimiter);

/*
 * Rota pública para o health check do Render.
 */
app.get('/api/health', (req, res) => {
  return res.status(200).json({
    status: 'UP',
    service: 'Santos Dumont Refectory API',
    environment: process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

/*
 * Rotas da API.
 */
app.use('/api/students', studentRoutes);
app.use('/api/meals', mealRoutes);
app.use('/api/reports', reportRoutes);

/*
 * Rota não encontrada.
 */
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message:
      `A rota ${req.method} ${req.originalUrl} não foi encontrada.`
  });
});

/*
 * Tratamento global de erros.
 */
app.use(globalErrorHandler);

/*
 * Inicialização do servidor.
 */
app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `API Santos Dumont iniciada na porta ${PORT} [0.0.0.0]`
  );
});