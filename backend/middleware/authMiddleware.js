/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Strict JWT Validation & RBAC Middleware
   ========================================================================== */

const { getAdminSupabase } = require('../config/supabase');

/**
 * Valida o token JWT enviado como:
 * Authorization: Bearer <token>
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith('Bearer ')
    ) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message:
          'Cabeçalho de autorização ausente ou malformatado.'
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

    const { data: authData, error: authError } =
      await adminSupabase.auth.getUser(token);

    if (authError || !authData?.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Token inválido, expirado ou revogado.'
      });
    }

    const user = authData.user;

    const { data: roleData, error: roleError } =
      await adminSupabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

    if (roleError) {
      console.error(
        'Erro ao consultar user_roles:',
        roleError.code || 'UNKNOWN_ROLE_ERROR'
      );

      return res.status(500).json({
        success: false,
        error: 'ROLE_LOOKUP_ERROR',
        message: 'Não foi possível verificar o perfil do usuário.'
      });
    }

    const userRole = roleData?.role || null;

    if (
      !userRole ||
      !['ADMIN', 'OPERATOR'].includes(userRole)
    ) {
      return res.status(403).json({
        success: false,
        error: 'NO_ASSIGNED_ROLE',
        message:
          'Usuário autenticado sem perfil de acesso autorizado.'
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: userRole
    };

    req.token = token;

    return next();
  } catch (error) {
    console.error(
      'Erro de processamento no authMiddleware:',
      error
    );

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Falha interna ao validar as credenciais.'
    });
  }
}

/**
 * Restringe a rota às funções informadas.
 * Exemplo: requireRole(['ADMIN'])
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (
      !req.user ||
      !allowedRoles.includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message:
          `Acesso restrito aos perfis: ${allowedRoles.join(', ')}.`
      });
    }

    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole
};