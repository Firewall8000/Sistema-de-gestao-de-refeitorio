/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Standardized Global Error Handler Middleware
   ========================================================================== */

function globalErrorHandler(err, req, res, next) {
  console.error(`❌ [API Error] ${req.method} ${req.originalUrl}:`, err);

  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'Ocorreu um erro interno no processamento da API.';

  return res.status(statusCode).json({
    success: false,
    error: errorCode,
    message: message
  });
}

module.exports = {
  globalErrorHandler
};
