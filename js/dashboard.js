/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Director Dashboard Controller, Real-time Queue & Report Generator
   ========================================================================== */

class DashboardController {
  constructor() {
    this.realtimeSubscribed = false;
  }

  /**
   * Initializes Supabase Realtime subscription for school_entries and meal_logs tables.
   */
  initRealtimeSubscription() {
    if (window.supabaseClient && !this.realtimeSubscribed) {
      this.realtimeSubscribed = true;
      try {
        window.supabaseClient
          .channel('realtime_dashboard_queue')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'school_entries' }, () => {
            console.log('⚡ Realtime update received on school_entries');
            this.refreshTodayMetrics();
            this.loadLunchQueueTable();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_logs' }, () => {
            console.log('⚡ Realtime update received on meal_logs');
            this.refreshTodayMetrics();
            this.loadLunchQueueTable();
          })
          .subscribe();
      } catch (err) {
        console.warn('⚠️ Erro ao assinar Supabase Realtime no Dashboard:', err);
      }
    }
  }

  /**
   * Updates real-time KPI metrics cards for today.
   */
  async refreshTodayMetrics() {
    if (!window.dbEngine || !window.mealValidatorService) return;

    // 1. Total Active Students
    const allStudents = await window.studentService.getAllStudents();
    const activeStudents = allStudents.filter(s => s.active);
    const totalActiveCount = activeStudents.length;

    // 2. Count Present Today in School (Portaria entries)
    let totalPresentCount = 0;
    if (window.mealValidatorService.getTodayEntriesCount) {
      totalPresentCount = await window.mealValidatorService.getTodayEntriesCount();
    }

    // 3. Count Served Today in Refectory (Meal logs)
    const servedTodayCount = await window.mealValidatorService.getTodayMealsCount();

    // 4. External Food / Did Not Eat Lunch: Math.max(0, totalPresentes - totalAlmoco)
    const externalFoodCount = Math.max(0, totalPresentCount - servedTodayCount);

    // 5. Adhesion Rate: (totalAlmoco / totalPresentes) * 100 if totalPresentes > 0, else 0.0%
    const rateVal = totalPresentCount > 0 
      ? ((servedTodayCount / totalPresentCount) * 100).toFixed(1) 
      : '0.0';

    // Update UI Cards
    const elTotal = document.getElementById('dash-total-students');
    const elPresent = document.getElementById('dash-present-today');
    const elServed = document.getElementById('dash-served-today');
    const elExternal = document.getElementById('dash-external-food');
    const elRate = document.getElementById('dash-rate');

    if (elTotal) elTotal.textContent = totalActiveCount;
    if (elPresent) elPresent.textContent = totalPresentCount;
    if (elServed) elServed.textContent = servedTodayCount;
    if (elExternal) elExternal.textContent = externalFoodCount;
    if (elRate) elRate.textContent = `${rateVal}%`;
  }

  /**
   * Loads real-time lunch queue table from Supabase view `lunch_queue_today` (with IndexedDB offline fallback).
   */
  async loadLunchQueueTable() {
    const tbody = document.getElementById('lunch-queue-table-body');
    if (!tbody) return;

    const todayStr = window.mealValidatorService.getTodayDateString();
    let queueList = null;

    // 1. Try Supabase View `lunch_queue_today`
    if (window.supabaseClient && navigator.onLine) {
      try {
        const { data, error } = await window.supabaseClient
          .from('lunch_queue_today')
          .select('*')
          .order('entry_time', { ascending: true });

        if (!error && data) {
          queueList = data.map(item => ({
            id: item.entry_id || item.id,
            studentRegistration: item.student_registration || item.registration,
            studentName: item.student_name || item.name,
            gradeTurma: `${item.grade || ''} ${item.turma ? '— ' + item.turma : ''}`.trim(),
            entryTime: item.entry_time || item.entryTime
          }));
        }
      } catch (err) {
        console.warn('⚠️ Falha ao buscar lunch_queue_today na nuvem. Usando banco local:', err);
      }
    }

    // 2. Offline / Local Fallback via IndexedDB
    if (!queueList) {
      try {
        const todayEntries = await window.dbEngine.getAllByIndex('school_entries', 'entry_date', todayStr);
        const todayMeals = await window.dbEngine.getAllByIndex('meal_logs', 'date', todayStr);
        const allStudents = await window.studentService.getAllStudents();

        const mealStudentIds = new Set(todayMeals.map(m => m.studentId || m.student_id));
        const mealRegs = new Set(todayMeals.map(m => m.studentRegistration || m.student_registration));
        const studentMapById = new Map(allStudents.map(s => [s.id, s]));

        // Filter entries where student hasn't eaten lunch today
        const unservedEntries = todayEntries.filter(entry => {
          const sId = entry.student_id || entry.studentId;
          const sReg = entry.student_registration || entry.studentRegistration;
          if (sId && mealStudentIds.has(sId)) return false;
          if (sReg && mealRegs.has(sReg)) return false;
          return true;
        });

        // Sort by entry_time ASC
        unservedEntries.sort((a, b) => {
          const tA = new Date(a.entry_time || a.entryTime).getTime();
          const tB = new Date(b.entry_time || b.entryTime).getTime();
          return tA - tB;
        });

        queueList = unservedEntries.map(entry => {
          const sObj = studentMapById.get(entry.student_id || entry.studentId);
          return {
            id: entry.id,
            studentRegistration: sObj ? sObj.registration : (entry.student_registration || entry.registration || '—'),
            studentName: entry.student_name || (sObj ? sObj.name : 'Aluno'),
            gradeTurma: sObj ? `${sObj.grade} — ${sObj.turma}` : (entry.turma || '—'),
            entryTime: entry.entry_time || entry.entryTime
          };
        });
      } catch (e) {
        console.warn('⚠️ Erro ao calcular fila localmente:', e);
        queueList = [];
      }
    }

    // 3. Render Queue Table
    if (queueList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            Nenhum aluno aguardando na fila do almoço no momento.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = queueList.map((row, idx) => {
      const positionStr = `${idx + 1}º`;
      const timeFormatted = window.mealValidatorService.formatTimeString(row.entryTime);
      return `
        <tr>
          <td style="text-align: center;">
            <span class="badge ${idx < 3 ? 'badge-warning' : 'badge-info'}" style="font-weight: 800;">${positionStr}</span>
          </td>
          <td><strong>${row.studentRegistration}</strong></td>
          <td>${row.studentName}</td>
          <td>${row.gradeTurma}</td>
          <td>${timeFormatted}</td>
          <td><span class="badge badge-warning">⌛ Aguardando Almoço</span></td>
        </tr>
      `;
    }).join('');
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

    let entriesOnDate = [];
    try {
      entriesOnDate = await window.dbEngine.getAllByIndex('school_entries', 'entry_date', dateString);
    } catch (e) {}

    const entryStudentIds = new Set(entriesOnDate.map(e => e.student_id || e.studentId));

    let reportRows = activeStudents.map(student => {
      const meal = mealMapByReg.get(student.registration);
      const isPresent = entryStudentIds.has(student.id) || !!meal;

      return {
        registration: student.registration,
        name: student.name,
        gradeTurma: `${student.grade} — ${student.turma}`,
        present: isPresent,
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
    } else if (statusFilter === 'PRESENT_NOT_SERVED') {
      reportRows = reportRows.filter(r => r.present && !r.served);
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
            : (row.present 
                ? '<span class="badge badge-danger">⚠️ PRESENTE S/ ALMOÇO (EXTERNA)</span>' 
                : '<span class="badge badge-warning">⌛ PENDENTE</span>')}
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

    let entriesOnDate = [];
    try {
      entriesOnDate = await window.dbEngine.getAllByIndex('school_entries', 'entry_date', dateString);
    } catch (e) {}
    const entryStudentIds = new Set(entriesOnDate.map(e => e.student_id || e.studentId));

    let csvContent = 'Matricula;Nome Completo;Serie/Turma;Presente Portaria;Status Almoco;Horario Almoco;Metodo Validacao\n';

    activeStudents.forEach(s => {
      const meal = mealMapByReg.get(s.registration);
      const isPresent = entryStudentIds.has(s.id) || !!meal;
      const status = meal ? 'ALMOCOU' : (isPresent ? 'PRESENTE_NAO_ALMOCOU_COMIDA_EXTERNA' : 'AUSENTE_PENDENTE');
      const time = meal ? window.mealValidatorService.formatTimeString(meal.timestamp) : '';
      const method = meal ? meal.validationMethod : '';

      csvContent += `"${s.registration}";"${s.name}";"${s.grade} ${s.turma}";"${isPresent ? 'SIM' : 'NAO'}";"${status}";"${time}";"${method}"\n`;
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
