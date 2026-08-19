/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Rate Limiting Protection Middleware
   ========================================================================== */

const {
  rateLimit,
  ipKeyGenerator
} = require('express-rate-limit');

/*
 * Resposta padronizada para limite excedido.
 */
function rateLimitHandler(req, res) {
  return res.status(429).json({
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message:
      'Muitas requisições foram realizadas. Aguarde um momento e tente novamente.'
  });
}

/*
 * Limite global da API.
 *
 * O valor considera que vários dispositivos da escola podem
 * compartilhar o mesmo endereço IP através do Wi-Fi.
 */
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,

  /*
   * Health checks automáticos do Render não consomem o limite.
   */
  skip(req) {
    return req.path === '/api/health';
  },

  handler: rateLimitHandler
});

/*
 * Limite específico para o scanner.
 *
 * mealRoutes executa requireAuth antes deste middleware,
 * portanto req.user.id já estará validado.
 */
const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,

  keyGenerator(req) {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  return `ip:${ipKeyGenerator(req.ip)}`;
},

  handler(req, res) {
    return res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message:
        'Limite temporário de leituras atingido. Aguarde alguns segundos.'
    });
  }
});

module.exports = {
  apiRateLimiter,
  strictRateLimiter
};