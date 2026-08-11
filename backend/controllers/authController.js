/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Auth Controller (Delegates Login to Supabase Auth & Checks user_roles)
   ========================================================================== */

const { getAdminSupabase } = require('../config/supabase');

/**
 * Autentica o usuário via Supabase Auth e retorna o access_token com a role verificada em user_roles.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: 'Email e senha são obrigatórios.'
      });
    }

    const adminSupabase = getAdminSupabase();

    // 1. Delegar Autenticação ao Supabase Auth Oficial
    const { data: authData, error: authError } = await adminSupabase.auth.signInWithPassword({
      email: email.trim(),
      password: password
    });

    if (authError || !authData.session) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Credenciais de acesso inválidas.'
      });
    }

    const user = authData.user;
    const accessToken = authData.session.access_token;

    // 2. Verificar Role na Tabela Protegida user_roles
    let userRole = null;
    const { data: roleData } = await adminSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData) {
      userRole = roleData.role;
    }

    // Se não tiver role no user_roles, nega acesso (retorna null, sem assumir OPERATOR)
    if (!userRole || !['ADMIN', 'OPERATOR'].includes(userRole)) {
      return res.status(401).json({
        success: false,
        error: 'NO_ASSIGNED_ROLE',
        message: 'Usuário autenticado, mas nenhum perfil de acesso foi atribuído a esta conta.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Login realizado com sucesso!',
      token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: userRole
      }
    });

  } catch (err) {
    next(err);
  }
}

module.exports = {
  login
};
