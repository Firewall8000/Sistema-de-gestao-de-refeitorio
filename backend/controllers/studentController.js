/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Student Management Controller (Soft Delete, SHA-256 Token Hash & Audit)
   ========================================================================== */

const crypto = require('crypto');
const { getAdminSupabase, getUserSupabase } = require('../config/supabase');

/**
 * Função utilitária para gerar token UUID v4 e seu Hash SHA-256.
 */
function generateQrTokenWithHash() {
  const rawToken = crypto.randomUUID();
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

/**
 * Lista todos os alunos ativos (Filtro RLS via escopo do usuário ou Admin).
 */
async function getAllStudents(req, res, next) {
  try {
    const userClient = getUserSupabase(req.token);
    
    let query = userClient
      .from('students')
      .select('id, registration, name, grade, turma, active, created_at, updated_at')
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (req.query.search) {
      query = query.or(`name.ilike.%${req.query.search}%,registration.ilike.%${req.query.search}%`);
    }
    if (req.query.grade) {
      query = query.eq('grade', req.query.grade);
    }
    if (req.query.turma) {
      query = query.eq('turma', req.query.turma);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.status(200).json({
      success: true,
      students: data || []
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Cadastra um novo aluno (Role ADMIN obrigatória).
 * Gera o hash SHA-256 para gravar no banco e retorna o token bruto para o crachá.
 */
async function createStudent(req, res, next) {
  try {
    const { name, registration, grade, turma } = req.body;

    if (!name || !registration || !grade || !turma) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: 'Nome, matrícula, série e turma são obrigatórios.'
      });
    }

    const adminSupabase = getAdminSupabase();

    // 1. Verificar unicidade de matrícula
    const { data: existing } = await adminSupabase
      .from('students')
      .select('id')
      .eq('registration', registration.trim())
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'DUPLICATE_REGISTRATION',
        message: `Já existe um estudante cadastrado com a matrícula ${registration}.`
      });
    }

    // 2. Gerar Token Bruto e Hash SHA-256
    const { rawToken, tokenHash } = generateQrTokenWithHash();

    const newStudent = {
      id: crypto.randomUUID(),
      name: name.trim(),
      registration: registration.trim(),
      grade: grade.trim(),
      turma: turma.trim(),
      active: true,
      qr_token_hash: tokenHash
    };

    const { data: inserted, error: insertErr } = await adminSupabase
      .from('students')
      .insert(newStudent)
      .select()
      .single();

    if (insertErr) throw insertErr;

    // 3. Registrar Log de Auditoria
    await adminSupabase.from('audit_logs').insert({
      table_name: 'students',
      action: 'CREATE_STUDENT',
      record_id: inserted.id,
      performed_by: req.user.id,
      payload: { registration: inserted.registration, name: inserted.name }
    });

    return res.status(201).json({
      success: true,
      message: 'Estudante cadastrado com sucesso!',
      student: {
        ...inserted,
        rawQrToken: rawToken // Retornado apenas no cadastro para geração da ficha/crachá
      }
    });

  } catch (err) {
    next(err);
  }
}

/**
 * Altera status Ativo/Inativo do estudante (Role ADMIN).
 */
async function toggleStudentStatus(req, res, next) {
  try {
    const { id } = req.params;
    const adminSupabase = getAdminSupabase();

    const { data: student, error: getErr } = await adminSupabase
      .from('students')
      .select('id, active, name')
      .eq('id', id)
      .single();

    if (getErr || !student) {
      return res.status(404).json({ success: false, message: 'Estudante não encontrado.' });
    }

    const updatedActive = !student.active;

    const { error: updateErr } = await adminSupabase
      .from('students')
      .update({ active: updatedActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateErr) throw updateErr;

    await adminSupabase.from('audit_logs').insert({
      table_name: 'students',
      action: 'TOGGLE_STATUS_STUDENT',
      record_id: id,
      performed_by: req.user.id,
      payload: { previousActive: student.active, newActive: updatedActive }
    });

    return res.status(200).json({
      success: true,
      message: `Status do aluno alterado para ${updatedActive ? 'ATIVO' : 'INATIVO'}.`,
      active: updatedActive
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Revoga o QR antigo e emite um novo token (Role ADMIN).
 */
async function reissueQrCode(req, res, next) {
  try {
    const { id } = req.params;
    const adminSupabase = getAdminSupabase();

    const { data: student } = await adminSupabase
      .from('students')
      .select('id, registration, name')
      .eq('id', id)
      .single();

    if (!student) {
      return res.status(404).json({ success: false, message: 'Estudante não encontrado.' });
    }

    const { rawToken, tokenHash } = generateQrTokenWithHash();

    const { error: updateErr } = await adminSupabase
      .from('students')
      .update({ qr_token_hash: tokenHash, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateErr) throw updateErr;

    await adminSupabase.from('audit_logs').insert({
      table_name: 'students',
      action: 'REISSUE_QR',
      record_id: id,
      performed_by: req.user.id,
      payload: { registration: student.registration }
    });

    return res.status(200).json({
      success: true,
      message: 'Novo QR Code gerado com sucesso! Código antigo revogado.',
      rawQrToken: rawToken
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Exclusão Lógica / Soft Delete de Estudante (Role ADMIN).
 */
async function softDeleteStudent(req, res, next) {
  try {
    const { id } = req.params;
    const adminSupabase = getAdminSupabase();

    const { data: student } = await adminSupabase
      .from('students')
      .select('id, name, registration')
      .eq('id', id)
      .single();

    if (!student) {
      return res.status(404).json({ success: false, message: 'Estudante não encontrado.' });
    }

    const nowIso = new Date().toISOString();

    const { error: updateErr } = await adminSupabase
      .from('students')
      .update({
        active: false,
        deleted_at: nowIso,
        deleted_by: req.user.id,
        updated_at: nowIso
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    await adminSupabase.from('audit_logs').insert({
      table_name: 'students',
      action: 'SOFT_DELETE_STUDENT',
      record_id: id,
      performed_by: req.user.id,
      payload: { registration: student.registration, name: student.name }
    });

    return res.status(200).json({
      success: true,
      message: `Cadastro do estudante "${student.name}" foi arquivado com sucesso.`
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllStudents,
  createStudent,
  toggleStudentStatus,
  reissueQrCode,
  softDeleteStudent
};
