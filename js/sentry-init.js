/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Sentry JavaScript SDK - Error Monitoring & Tracing Initialization
   ========================================================================== */

/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Sentry JavaScript SDK - Error Monitoring & Tracing Initialization
   ========================================================================== */

(function () {
  const sentryDsn = window.SENTRY_DSN || 'https://cc4a74aefdec84c49de43852c843caac@o4512226716942336.ingest.us.sentry.io/4512226763669504';

  if (!window.Sentry) {
    console.warn('[Sentry] SDK bundle não foi carregado.');
    return;
  }

  if (!sentryDsn) {
    console.warn('[Sentry] DSN não configurado.');
    return;
  }

  try {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    const integrations = [];
    if (typeof window.Sentry.browserTracingIntegration === 'function') {
      integrations.push(window.Sentry.browserTracingIntegration());
    }

    window.Sentry.init({
      dsn: sentryDsn,
      release: 'santos-dumont-refectory-qr@1.0.0',
      environment: isLocalhost ? 'development' : 'production',
      
      // REGRA LGPD: Não envia dados pessoais de estudantes
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request && event.request.url) {
          event.request.url = event.request.url.replace(/registration=\d+/g, 'registration=REDACTED');
        }
        return event;
      },

      integrations: integrations,
      tracesSampleRate: 0.2, // 20% das transações para economizar a cota gratuita
      tracePropagationTargets: ['localhost', /^https:\/\/.*\.supabase\.co/]
    });

    console.log('[Sentry] Monitoramento ativo (' + (isLocalhost ? 'development' : 'production') + ').');
  } catch (err) {
    console.error('[Sentry] Falha ao inicializar o SDK:', err);
  }

  // Helper global para teste de verificação
  window.triggerSentryTestError = function (customMessage) {
    const errorMsg = customMessage || ('Sentry verification test error ' + new Date().toISOString());
    console.log('[Sentry] Disparando erro de teste:', errorMsg);
    if (window.Sentry && typeof window.Sentry.captureException === 'function') {
      return window.Sentry.captureException(new Error(errorMsg));
    }
    throw new Error(errorMsg);
  };
})();