/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Supabase Dual Client Configuration (Service Role & User-Scoped RLS)
   ========================================================================== */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bxbouiubbyakwostjypu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_p5IE2xVpmL2Vdr2y2etCnA_FI7tyDtI';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL) {
  console.error('❌ ERRO CRÍTICO: SUPABASE_URL não configurada.');
}

/**
 * Retorna o cliente administrativo do Supabase com Service Role Key.
 * EXCLUSIVO para o backend (invocação de RPCs restritas, auditoria e soft delete).
 */
function getAdminSupabase() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️ AVISO: SUPABASE_SERVICE_ROLE_KEY não foi informada. Operando em modo de contingência.');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/**
 * Retorna um cliente Supabase escopado ao JWT do usuário autenticado.
 * Preserva o PostgreSQL Row Level Security (RLS) para consultas normais.
 */
function getUserSupabase(jwtToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${jwtToken}`
      }
    },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  getAdminSupabase,
  getUserSupabase
};
