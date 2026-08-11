/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Meal Validation Controller (Atomic RPC Execution)
   ========================================================================== */

const crypto = require('crypto');
const { getAdminSupabase } = require('../config/supabase');

/**
 * Endpoint para validar e registrar refeição por QR Token ou Matrícula.
 * Invoca a RPC atômica registrando no PostgreSQL com fuso America/Maceio e idempotência.
 */
async function validateMeal(req, res, next) {
  try {
    const { identifier, method = 'QR_SCAN', idempotencyKey } = req.body;

    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: 'O identificador (QR Token ou Matrícula) é obrigatório.'
      });
    }

    const cleanIdentifier = identifier.trim();

    // 1. Garantir idempotencyKey no formato UUID
    let validIdempotencyKey = idempotencyKey;
    if (!validIdempotencyKey || typeof validIdempotencyKey !== 'string') {
      validIdempotencyKey = crypto.randomUUID();
    }

    // 2. Determinar is_offline_sync com segurança no servidor
    const isOfflineSyncHeader = req.headers['x-offline-sync'] === 'true' || req.body.isOfflineSync === true;

    const adminSupabase = getAdminSupabase();

    // 3. Invocação Transacional da RPC Blindada
    const { data: rpcResult, error: rpcError } = await adminSupabase.rpc('register_meal_rpc', {
      p_identifier: cleanIdentifier,
      p_method: method,
      p_idempotency_key: validIdempotencyKey,
      p_is_offline_sync: isOfflineSyncHeader
    });

    if (rpcError) {
      console.error('❌ Erro na invocação da RPC register_meal_rpc:', rpcError);
      return res.status(500).json({
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Falha ao processar a validação da refeição no banco de dados.'
      });
    }

    // 4. Mapear Respostas Padronizadas
    const status = rpcResult?.status;

    if (status === 'GRANTED') {
      return res.status(200).json({
        success: true,
        status: 'GRANTED',
        subStatus: rpcResult.sub_status || 'NORMAL',
        message: rpcResult.message || 'Almoço liberado com sucesso!',
        mealId: rpcResult.meal_id,
        studentName: rpcResult.student_name,
        grade: rpcResult.grade,
        turma: rpcResult.turma
      });
    }

    if (status === 'ALREADY_GRANTED') {
      return res.status(200).json({
        success: false,
        status: 'ALREADY_GRANTED',
        message: rpcResult.message || 'Refeição já concedida hoje para este aluno.'
      });
    }

    if (status === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        status: 'NOT_FOUND',
        message: rpcResult.message || 'Estudante não encontrado com o código fornecido.'
      });
    }

    if (status === 'INACTIVE') {
      return res.status(403).json({
        success: false,
        status: 'INACTIVE',
        message: rpcResult.message || 'Cadastro do estudante está inativo ou arquivado.'
      });
    }

    return res.status(400).json({
      success: false,
      status: status || 'ERROR',
      message: rpcResult?.message || 'Não foi possível validar a refeição.'
    });

  } catch (err) {
    next(err);
  }
}

/**
 * Endpoint para obter a contagem de almoços servidos hoje.
 */
async function getTodayMealCount(req, res, next) {
  try {
    const todayMaceio = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Maceio' });
    const adminSupabase = getAdminSupabase();

    const { count, error } = await adminSupabase
      .from('meal_logs')
      .select('id', { count: 'exact', head: true })
      .eq('meal_date', todayMaceio);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      date: todayMaceio,
      count: count || 0
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  validateMeal,
  getTodayMealCount
};
