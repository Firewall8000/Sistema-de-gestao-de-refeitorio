/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Standardized Global Error Handler
   ========================================================================== */

/*
 * Códigos cujas mensagens podem ser apresentadas ao usuário.
 */
const PUBLIC_ERROR_CODES = new Set([
  'CORS_ORIGIN_DENIED',
  'INVALID_INPUT',
  'INVALID_METHOD',
  'INVALID_IDEMPOTENCY_KEY',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NO_ASSIGNED_ROLE',
  'NOT_FOUND',
  'RATE_LIMIT_EXCEEDED'
]);

function globalErrorHandler(err, req, res, next) {
  const rawStatus =
    Number(err.statusCode || err.status) || 500;

  const statusCode =
    rawStatus >= 400 && rawStatus <= 599
      ? rawStatus
      : 500;

  const errorCode =
    typeof err.code === 'string'
      ? err.code
      : 'INTERNAL_SERVER_ERROR';

  /*
   * Registra somente informações necessárias.
   * Não registra headers, corpo, JWT ou chaves.
   */
  console.error('[API Error]', {
    method: req.method,
    path: req.originalUrl,
    status: statusCode,
    code: errorCode,
    message:
      process.env.NODE_ENV === 'production'
        ? undefined
        : err.message
  });

  const canExposeMessage =
    statusCode < 500 &&
    PUBLIC_ERROR_CODES.has(errorCode);

  const message = canExposeMessage
    ? err.message
    : 'Ocorreu um erro interno no processamento da API.';

  return res.status(statusCode).json({
    success: false,
    error:
      statusCode >= 500
        ? 'INTERNAL_SERVER_ERROR'
        : errorCode,
    message
  });
}

module.exports = {
  globalErrorHandler
};