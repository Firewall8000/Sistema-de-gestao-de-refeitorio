/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Supabase & Environment Configuration
   ========================================================================== */

const SUPABASE_CONFIG = {
  url: 'https://bxbouiubbyakwostjypu.supabase.co',
  anonKey: 'sb_publishable_p5IE2xVpmL2Vdr2y2etCnA_FI7tyDtI'
};

// Initialize Supabase Client globally if SDK is loaded
let supabaseClient = null;

if (window.supabase && typeof window.supabase.createClient === 'function') {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    console.log('⚡ Supabase Client conectado com sucesso à nuvem:', SUPABASE_CONFIG.url);
  } catch (err) {
    console.warn('⚠️ Falha ao conectar Supabase Client:', err);
  }
} else {
  console.warn('⚠️ Supabase JS SDK ainda não carregado. Operando em fallback local.');
}

window.SUPABASE_CONFIG = SUPABASE_CONFIG;
window.supabaseClient = supabaseClient;
