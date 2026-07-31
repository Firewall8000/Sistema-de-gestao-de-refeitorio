/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Director Dashboard Controller & Report Generator
   ========================================================================== */

class DashboardController {

  /**
   * Updates real-time KPI metrics cards for today.
   */
  async refreshTodayMetrics() {
    if (!window.dbEngine || !window.mealValidatorService) return;

    const allStudents = await window.studentService.getAllStudents();
    const activeStudents = allStudents.filter(s => s.active);

    const servedTodayCount = await window.mealValidatorService.getTodayMealsCount();
    const totalActiveCount = activeStudents.length;
    const pendingTodayCount = Math.max(0, totalActiveCount - servedTodayCount);

    const rate = totalActiveCount > 0 ? ((servedTodayCount / totalActiveCount) * 100).toFixed(1) : '0';

    const elTotal = document.getElementById('dash-total-students');
    const elServed = document.getElementById('dash-served-today');
    const elPending = document.getElementById('dash-pending-today');
    const elRate = document.getElementById('dash-rate');

    if (elTotal) elTotal.textContent = totalActiveCount;
    if (elServed) elServed.textContent = servedTodayCount;
    if (elPending) elPending.textContent = pendingTodayCount;
    if (elRate) elRate.textContent = `${rate}%`;
  }

  /**
   * Loads report table for a specific date and status filter.
   */
  async loadReportTable(dateString, statusFilter = 'ALL') {
    const tbody = document.getElementById('report-table-body');
    if (!tbody) return;

    if (!dateString) {
      dateString = window.mealValidatorService.getTodayDateString();
    }

    const allStudents = await window.studentService.getAllStudents();
    const activeStudents = allStudents.filter(s => s.active);

    const mealsOnDate = await window.dbEngine.getAllByIndex('meal_logs', 'date', dateString);
    const mealMapByReg = new Map(mealsOnDate.map(m => [m.studentRegistration, m]));

    let reportRows = activeStudents.map(student => {
      const meal = mealMapByReg.get(student.registration);
      return {
        registration: student.registration,
        name: student.name,
        gradeTurma: `${student.grade} — ${student.turma}`,
        served: !!meal,
        time: meal ? window.mealValidatorService.formatTimeString(meal.timestamp) : '—',
        method: meal ? meal.validationMethod : '—'
      };
    });

    // Apply Filter
    if (statusFilter === 'SERVED') {
      reportRows = reportRows.filter(r => r.served);
    } else if (statusFilter === 'PENDING') {
      reportRows = reportRows.filter(r => !r.served);
    }

    if (reportRows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            Nenhum registro de aluno encontrado para os filtros selecionados (${dateString}).
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = reportRows.map(row => `
      <tr>
        <td><strong>${row.registration}</strong></td>
        <td>${row.name}</td>
        <td>${row.gradeTurma}</td>
        <td>${row.time} ${row.method !== '—' ? `<small style="color: var(--text-dim);">(${row.method})</small>` : ''}</td>
        <td>
          ${row.served 
            ? '<span class="badge badge-success">✓ ALMOÇOU</span>' 
            : '<span class="badge badge-warning">⌛ PENDENTE</span>'}
        </td>
      </tr>
    `).join('');
  }

  /**
   * Exports historical report data as a downloadable CSV file.
   */
  async exportReportCsv(dateString) {
    if (!dateString) dateString = window.mealValidatorService.getTodayDateString();

    const allStudents = await window.studentService.getAllStudents();
    const activeStudents = allStudents.filter(s => s.active);

    const mealsOnDate = await window.dbEngine.getAllByIndex('meal_logs', 'date', dateString);
    const mealMapByReg = new Map(mealsOnDate.map(m => [m.studentRegistration, m]));

    let csvContent = 'Matricula;Nome Completo;Serie/Turma;Status Almoco;Horario Almoco;Metodo Validacao\n';

    activeStudents.forEach(s => {
      const meal = mealMapByReg.get(s.registration);
      const status = meal ? 'ALMOCOU' : 'PENDENTE';
      const time = meal ? window.mealValidatorService.formatTimeString(meal.timestamp) : '';
      const method = meal ? meal.validationMethod : '';

      csvContent += `"${s.registration}";"${s.name}";"${s.grade} ${s.turma}";"${status}";"${time}";"${method}"\n`;
    });

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_Almoco_SantosDumont_${dateString}.csv`;
    link.click();
  }
}

const dashboardController = new DashboardController();
window.dashboardController = dashboardController;
