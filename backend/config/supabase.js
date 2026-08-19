/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Supabase Client Configuration
   ========================================================================== */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

function validateEnvironment() {
  const missingVariables = [];

  if (!SUPABASE_URL) {
    missingVariables.push('SUPABASE_URL');
  }

  if (!SUPABASE_ANON_KEY) {
    missingVariables.push('SUPABASE_ANON_KEY');
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    missingVariables.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (missingVariables.length > 0) {
    throw new Error(
      `Variáveis obrigatórias ausentes: ${missingVariables.join(', ')}`
    );
  }

  try {
    const parsedUrl = new URL(SUPABASE_URL);

    if (
      parsedUrl.protocol !== 'https:' ||
      !parsedUrl.hostname.endsWith('.supabase.co')
    ) {
      throw new Error();
    }
  } catch {
    throw new Error('SUPABASE_URL possui formato inválido.');
  }
}

validateEnvironment();

/**
 * Cliente administrativo, exclusivo do backend.
 */
function getAdminSupabase() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}

/**
 * Cliente escopado ao JWT do usuário.
 */
function getUserSupabase(jwtToken) {
  if (!jwtToken || typeof jwtToken !== 'string') {
    throw new Error('JWT do usuário não informado.');
  }

  return createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${jwtToken}`
        }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}

module.exports = {
  getAdminSupabase,
  getUserSupabase
};