/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Supabase & Environment Configuration
   ========================================================================== */

const SUPABASE_CONFIG = {
  url: window.SUPABASE_URL || '',
  anonKey: window.SUPABASE_ANON_KEY || ''
};

let supabaseClient = null;

const hasValidSupabaseConfig =
  typeof SUPABASE_CONFIG.url === 'string' &&
  SUPABASE_CONFIG.url.startsWith('https://') &&
  typeof SUPABASE_CONFIG.anonKey === 'string' &&
  SUPABASE_CONFIG.anonKey.trim() !== '';

if (!hasValidSupabaseConfig) {
  console.error(
    'Configuração do Supabase ausente ou inválida. ' +
    'Verifique SUPABASE_URL e SUPABASE_ANON_KEY.'
  );
} else if (
  window.supabase &&
  typeof window.supabase.createClient === 'function'
) {
  try {
    supabaseClient = window.supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    console.log(
      'Supabase Client inicializado com a configuração do ambiente.'
    );
  } catch (error) {
    console.error(
      'Falha ao inicializar o Supabase Client:',
      error
    );
  }
} else {
  console.error(
    'Supabase JS SDK não foi carregado.'
  );
}

window.SUPABASE_CONFIG = SUPABASE_CONFIG;
window.supabaseClient = supabaseClient;