/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Reports Controller (Admin Role Required)
   ========================================================================== */

const { getAdminSupabase } = require('../config/supabase');

/**
 * Consulta o relatório detalhado de refeições filtrado por data e status/turma.
 */
async function getMealReport(req, res, next) {
  try {
    const { date, turma } = req.query;
    const targetDate = date || new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Maceio' });

    const adminSupabase = getAdminSupabase();

    let query = adminSupabase
      .from('meal_logs')
      .select('*')
      .eq('meal_date', targetDate)
      .order('timestamp', { ascending: false });

    if (turma) {
      query = query.eq('turma', turma);
    }

    const { data: logs, error } = await query;
    if (error) throw error;

    return res.status(200).json({
      success: true,
      date: targetDate,
      totalCount: logs ? logs.length : 0,
      logs: logs || []
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMealReport
};
