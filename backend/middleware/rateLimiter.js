/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Rate Limiting Protection Middleware
   ========================================================================== */

const rateLimit = require('express-rate-limit');

/**
 * Limitador global para prevenção de abuso e ataques de negação de serviço.
 * Permite até 200 requisições a cada 15 minutos por IP.
 */
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Muitas requisições originadas deste IP. Por favor, aguarde alguns minutos.'
  }
});

/**
 * Limitador estrito para operações sensíveis (ex: validação de refeição / QR).
 * Permite até 60 requisições por minuto por IP.
 */
const strictRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Limite de requisições por minuto atingido para o leitor de QR Code.'
  }
});

module.exports = {
  apiRateLimiter,
  strictRateLimiter
};
