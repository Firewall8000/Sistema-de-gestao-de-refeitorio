/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Strict JWT Validation & RBAC Middleware (Supabase Auth Integration)
   ========================================================================== */

const { getAdminSupabase } = require('../config/supabase');

/**
 * Middleware para validar o token JWT enviado no cabeçalho Authorization: Bearer <token>.
 * Valida a sessão diretamente com o Supabase Auth e consulta a role na tabela user_roles.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Cabeçalho de autorização ausente ou malformatado.'
      });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Token de acesso não fornecido.'
      });
    }

    const adminSupabase = getAdminSupabase();

    // 1. Validar Token com o Supabase Auth Oficial
    const { data: authData, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !authData.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Token inválido, expirado ou revogado.'
      });
    }

    const user = authData.user;

    // 2. Consultar Role Oficial na Tabela Protegida user_roles
    let userRole = null;
    try {
      const { data: roleData, error: roleError } = await adminSupabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (!roleError && roleData) {
        userRole = roleData.role;
      }
    } catch (e) {
      console.warn('⚠️ Erro ao consultar user_roles no middleware:', e.message);
    }

    // Se o usuário não possui linha cadastrada na tabela user_roles, o acesso é negado (retorna 403 FORBIDDEN, nunca assume OPERATOR)
    if (!userRole || !['ADMIN', 'OPERATOR'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'NO_ASSIGNED_ROLE',
        message: 'Usuário autenticado, mas nenhum perfil de acesso (ADMIN/OPERATOR) foi atribuído a esta conta.'
      });
    }

    // Injetar contexto validado da requisição
    req.user = {
      id: user.id,
      email: user.email,
      role: userRole
    };
    req.token = token;

    next();
  } catch (err) {
    console.error('❌ Erro de processamento no authMiddleware:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Falha interna ao validar credenciais.'
    });
  }
}

/**
 * Middleware para exigir roles específicas em rotas administrativas (ex: ['ADMIN']).
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: `Acesso negado. Ação restrita a usuários com perfil: ${allowedRoles.join(', ')}.`
      });
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole
};
