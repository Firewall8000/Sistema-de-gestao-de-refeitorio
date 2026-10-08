/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Director Dashboard Controller, TV Live Feed, AI Engine & Report Generator
   ========================================================================== */

class DashboardController {
  constructor() {
    this.realtimeSubscribed = false;
    this.tvClockInterval = null;
    this.currentPeriod = 'today';
  }

  // ========================================================================
  //  SUPABASE REALTIME SUBSCRIPTION
  // ========================================================================


  initRealtimeSubscription() {
    if (window.supabaseClient && !this.realtimeSubscribed) {
      this.realtimeSubscribed = true;
      try {
        window.supabaseClient
          .channel('realtime_dashboard_queue')
          // Escuta novas entradas na portaria
          .on('postgres_changes', { event: '*', schema: 'public', table: 'school_entries' }, () => {
            this.refreshTodayMetrics();
            this.refreshTvFeed();
            this.refreshDashboardForPeriod();
          })
          // Escuta novas refeições no refeitório
          .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_logs' }, () => {
            this.refreshTodayMetrics();
            this.refreshTvFeed();
            this.refreshDashboardForPeriod();
          })
          .subscribe();

        // Justificativas não têm Realtime (tabela protegida): atualiza a cada 30 s
        setInterval(() => {
          if (!document.hidden && document.getElementById('report-table-body')) this.loadAuditTable();
        }, 30000);
      } catch (err) {
        console.warn('⚠️ Erro ao assinar Supabase Realtime no Dashboard:', err);
      }
    }
  }

  // ========================================================================
  //  PERIOD HELPER (Today / Week / Month)
  // ========================================================================

  getPeriodDates(period) {
    const now = new Date();
    const todayStr = this._dateStr(now);
    
    if (period === 'today') {
      return { start: todayStr, end: todayStr, label: 'Hoje' };
    }
    
    if (period === 'week') {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      return { start: this._dateStr(monday), end: todayStr, label: 'Esta Semana' };
    }
    
    if (period === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: this._dateStr(firstDay), end: todayStr, label: 'Este Mês' };
    }
    
    return { start: todayStr, end: todayStr, label: 'Hoje' };
  }

  _dateStr(d) {
    return d.toISOString().split('T')[0];
  }

  setCurrentPeriod(period) {
    this.currentPeriod = period;
    
    document.querySelectorAll('.dash-period-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-period') === period);
    });
    
    const badgeEl = document.getElementById('ai-period-badge');
    const { label } = this.getPeriodDates(period);
    if (badgeEl) badgeEl.textContent = label;
    
    this.refreshDashboardForPeriod();
  }

  async refreshDashboardForPeriod() {
    await this.refreshTodayMetrics();
    await this.loadAuditTable();
    await this.generateAIInsights();
  }

  // ========================================================================
  //  KPI METRICS
  // ========================================================================

  async refreshTodayMetrics() {
    if (!window.dbEngine || !window.mealValidatorService) return;

    const allStudents = await window.studentService.getAllStudents();
    const activeStudents = allStudents.filter(s => s.active);
    const totalActiveCount = activeStudents.length;

    let totalPresentCount = 0;
    if (window.mealValidatorService.getTodayEntriesCount) {
      totalPresentCount = await window.mealValidatorService.getTodayEntriesCount();
    }

    const servedTodayCount = await window.mealValidatorService.getTodayMealsCount();
    const externalFoodCount = Math.max(0, totalPresentCount - servedTodayCount);

    const elTotal = document.getElementById('dash-total-students');
    const elPresent = document.getElementById('dash-present-today');
    const elServed = document.getElementById('dash-served-today');
    const elExternal = document.getElementById('dash-external-food');

    if (elTotal) elTotal.textContent = totalActiveCount;
    if (elPresent) elPresent.textContent = totalPresentCount;
    if (elServed) elServed.textContent = servedTodayCount;
    if (elExternal) elExternal.textContent = externalFoodCount;
  }

  // ========================================================================
  //  LUNCH QUEUE TABLE (legacy support)
  // ========================================================================

  async loadLunchQueueTable() {
    const tbody = document.getElementById('lunch-queue-table-body');
    if (!tbody) return;

    const todayStr = window.mealValidatorService.getTodayDateString();
    let queueList = null;

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

    if (!queueList) {
      try {
        const todayEntries = await window.dbEngine.getAllByIndex('school_entries', 'entry_date', todayStr);
        const todayMeals = await window.dbEngine.getAllByIndex('meal_logs', 'date', todayStr);
        const allStudents = await window.studentService.getAllStudents();

        const mealStudentIds = new Set(todayMeals.map(m => m.studentId || m.student_id));
        const mealRegs = new Set(todayMeals.map(m => m.studentRegistration || m.student_registration));
        const studentMapById = new Map(allStudents.map(s => [s.id, s]));

        const unservedEntries = todayEntries.filter(entry => {
          const sId = entry.student_id || entry.studentId;
          const sReg = entry.student_registration || entry.studentRegistration;
          if (sId && mealStudentIds.has(sId)) return false;
          if (sReg && mealRegs.has(sReg)) return false;
          return true;
        });

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

  // ========================================================================
  //  TV LIVE FEED
  // ========================================================================

  startTvClock() {
    if (this.tvClockInterval) return;
    const clockEl = document.getElementById('tv-clock');
    if (!clockEl) return;

    const updateClock = () => {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    updateClock();
    this.tvClockInterval = setInterval(updateClock, 1000);
  }

  stopTvClock() {
    if (this.tvClockInterval) {
      clearInterval(this.tvClockInterval);
      this.tvClockInterval = null;
    }
  }

  async refreshTvFeed() {
    const todayStr = window.mealValidatorService 
      ? window.mealValidatorService.getTodayDateString() 
      : new Date().toISOString().split('T')[0];

    let todayEntries = [];
    let todayMeals = [];
    let allStudents = [];

    // 1. BUSCA EM TEMPO REAL DIRETO DO SUPABASE (NUVEM)
    if (window.supabaseClient && navigator.onLine) {
      try {
        // Busca entradas da portaria de hoje (mais recentes primeiro)
        const { data: entriesData } = await window.supabaseClient
          .from('school_entries')
          .select('*')
          .eq('entry_date', todayStr)
          .order('entry_time', { ascending: false });

        if (entriesData) todayEntries = entriesData;

        // Busca refeições do refeitório de hoje (mais recentes primeiro)
        const { data: mealsData } = await window.supabaseClient
          .from('meal_logs')
          .select('*')
          .eq('date', todayStr)
          .order('timestamp', { ascending: false });

        if (mealsData) todayMeals = mealsData;
      } catch (err) {
        console.warn('⚠️ Falha ao buscar feed da TV no Supabase:', err);
      }
    }

    // 2. FALLBACK PARA O BANCO LOCAL (apenas se estiver offline)
    if (todayEntries.length === 0 && window.dbEngine) {
      try {
        todayEntries = await window.dbEngine.getAllByIndex('school_entries', 'entry_date', todayStr);
      } catch (e) {}
    }
    if (todayMeals.length === 0 && window.dbEngine) {
      try {
        todayMeals = await window.dbEngine.getAllByIndex('meal_logs', 'date', todayStr);
      } catch (e) {}
    }

    try {
      allStudents = await window.studentService.getAllStudents();
    } catch (e) {}

    const studentMap = new Map(allStudents.map(s => [s.id, s]));
    const studentMapByReg = new Map(allStudents.map(s => [s.registration, s]));

    // Contadores da TV
    const presentCount = todayEntries.length;
    const servedCount = todayMeals.length;
    const waitingCount = Math.max(0, presentCount - servedCount);

    const elPresent = document.getElementById('tv-present-count');
    const elServed = document.getElementById('tv-served-count');
    const elWaiting = document.getElementById('tv-waiting-count');
    const elPortariaTotal = document.getElementById('tv-portaria-total');
    const elRefTotal = document.getElementById('tv-refeitorio-total');

    if (elPresent) elPresent.textContent = presentCount;
    if (elServed) elServed.textContent = servedCount;
    if (elWaiting) elWaiting.textContent = waitingCount;
    if (elPortariaTotal) elPortariaTotal.textContent = presentCount;
    if (elRefTotal) elRefTotal.textContent = servedCount;

    // Feed da Portaria (ordem decrescente de chegada)
    const portariaList = document.getElementById('tv-feed-portaria-list');
    if (portariaList) {
      if (todayEntries.length === 0) {
        portariaList.innerHTML = '<div class="tv-feed-empty">Nenhum registro de entrada hoje</div>';
      } else {
        portariaList.innerHTML = todayEntries.map((entry, idx) => {
          const sId = entry.student_id || entry.studentId;
          const sObj = studentMap.get(sId);
          const name = entry.student_name || (sObj ? sObj.name : 'Aluno');
          const gradeTurma = sObj ? `${sObj.grade} — ${sObj.turma}` : (entry.turma || '');
          const time = window.mealValidatorService.formatTimeString(entry.entry_time || entry.entryTime);
          return `
            <div class="tv-feed-item ${idx === 0 ? 'tv-feed-item-new' : ''}">
              <div class="tv-feed-item-name" title="${name}">${name}</div>
              <div class="tv-feed-item-meta">
                <div class="tv-feed-item-time">${time}</div>
                <div>${gradeTurma}</div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Feed do Refeitório (ordem decrescente de refeição)
    const refList = document.getElementById('tv-feed-refeitorio-list');
    if (refList) {
      if (todayMeals.length === 0) {
        refList.innerHTML = '<div class="tv-feed-empty">Nenhum almoço registrado hoje</div>';
      } else {
        refList.innerHTML = todayMeals.map((meal, idx) => {
          const reg = meal.studentRegistration || meal.student_registration;
          const sObj = studentMapByReg.get(reg);
          const name = meal.studentName || (sObj ? sObj.name : 'Aluno');
          const gradeTurma = sObj ? `${sObj.grade} — ${sObj.turma}` : (meal.turma || '');
          const time = window.mealValidatorService.formatTimeString(meal.timestamp || meal.created_at);
          return `
            <div class="tv-feed-item ${idx === 0 ? 'tv-feed-item-new' : ''}">
              <div class="tv-feed-item-name" title="${name}">${name}</div>
              <div class="tv-feed-item-meta">
                <div class="tv-feed-item-time">${time}</div>
                <div>${gradeTurma}</div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  // ========================================================================
  //  AUDIT TABLE (Dashboard)
  // ========================================================================

  _esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  _justBadge(j) {
    const t = j.created_at ? new Date(j.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    const hora = t ? ` <small>(${t})</small>` : '';
    const map = {
      marmita:   ['rgba(59,130,246,0.2)', '#60a5fa', '🍱 MARMITA'],
      externa:   ['rgba(168,85,247,0.2)', '#c084fc', '🛵 COMIDA EXTERNA (iFood/familiar)'],
      a_caminho: ['rgba(34,197,94,0.2)',  '#4ade80', '🚶 A CAMINHO DO REFEITÓRIO'],
      saude:     ['rgba(239,68,68,0.2)',  '#f87171', '🩺 MOTIVO DE SAÚDE']
    };
    if (j.motivo === 'outros') {
      const n = this._esc(j.notes || '');
      return `<span class="badge" style="background: rgba(234,179,8,0.2); color: #fde047;" title="${n}">✍️ OUTROS: ${n}${hora}</span>`;
    }
    const m = map[j.motivo] || ['rgba(148,163,184,0.2)', '#cbd5e1', this._esc(j.motivo)];
    return `<span class="badge" style="background: ${m[0]}; color: ${m[1]};">${m[2]}${hora}</span>`;
  }

  async loadAuditTable() {
    const tbody = document.getElementById('report-table-body');
    if (!tbody) return;

    const statusFilter = document.getElementById('report-filter-status')?.value || 'ALL';
    const searchQuery = (document.getElementById('audit-search')?.value || '').toLowerCase().trim();
    const todayStr = window.mealValidatorService.getTodayDateString();

    const allStudents = await window.studentService.getAllStudents();
    const activeStudents = allStudents.filter(s => s.active);

    const mealsOnDate = await window.dbEngine.getAllByIndex('meal_logs', 'date', todayStr);
    const mealMapByReg = new Map(mealsOnDate.map(m => [m.studentRegistration || m.student_registration, m]));

    let entriesOnDate = [];
    try {
      entriesOnDate = await window.dbEngine.getAllByIndex('school_entries', 'entry_date', todayStr);
    } catch (e) {}

    const entryMapByStudentId = new Map();
    entriesOnDate.forEach(e => {
      const sId = e.student_id || e.studentId;
      if (sId) entryMapByStudentId.set(sId, e);
    });

    // Justificativas do dia (alunos que informaram por que não almoçaram)
    const justMap = new Map();
    try {
      if (window.supabaseClient && navigator.onLine) {
        const { data } = await window.supabaseClient.rpc('list_justifications_today');
        (data || []).forEach(j => justMap.set(j.student_registration, j));
      }
    } catch (e) {}

    let reportRows = activeStudents.map(student => {
      const meal = mealMapByReg.get(student.registration);
      const entry = entryMapByStudentId.get(student.id);
      const isPresent = !!entry || !!meal;

      return {
        registration: student.registration,
        name: student.name,
        gradeTurma: `${student.grade} — ${student.turma}`,
        present: isPresent,
        served: !!meal,
        entryTime: entry ? window.mealValidatorService.formatTimeString(entry.entry_time || entry.entryTime) : '—',
        mealTime: meal ? window.mealValidatorService.formatTimeString(meal.timestamp) : '—',
        method: meal ? (meal.validationMethod || meal.validation_method) : '—',
        mealStatus: meal ? (meal.mealStatus || meal.meal_status || null) : null,
        mealNotes: meal ? (meal.notes || null) : null,
        just: justMap.get(student.registration) || null
      };
    });

    // Apply Status Filter
    if (statusFilter === 'SERVED') {
      reportRows = reportRows.filter(r => r.served);
    } else if (statusFilter === 'PENDING') {
      reportRows = reportRows.filter(r => !r.served);
    } else if (statusFilter === 'PRESENT_NOT_SERVED') {
      reportRows = reportRows.filter(r => r.present && !r.served);
    }

    // Apply Search Filter
    if (searchQuery) {
      reportRows = reportRows.filter(r =>
        r.name.toLowerCase().includes(searchQuery) ||
        r.registration.toLowerCase().includes(searchQuery)
      );
    }

    if (reportRows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            Nenhum registro encontrado para os filtros selecionados.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = reportRows.map(row => {
      // Determine the correct status badge
      let statusBadge;
      if (row.served) {
        if (row.mealStatus === 'marmita') {
          statusBadge = '<span class="badge" style="background: rgba(59,130,246,0.2); color: #60a5fa;">🍱 MARMITA</span>';
        } else if (row.mealStatus === 'externa') {
          statusBadge = '<span class="badge" style="background: rgba(168,85,247,0.2); color: #c084fc;">🛵 COMIDA EXTERNA</span>';
        } else if (row.mealStatus === 'saude') {
          statusBadge = '<span class="badge" style="background: rgba(239,68,68,0.2); color: #f87171;">🩺 MOTIVO DE SAÚDE</span>';
        } else if (row.mealStatus === 'outros') {
          const notesEscaped = (row.mealNotes || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
          statusBadge = `<span class="badge" style="background: rgba(234,179,8,0.2); color: #fde047;" title="${notesEscaped}">✍️ OUTROS: ${notesEscaped}</span>`;
        } else {
          statusBadge = '<span class="badge badge-success">✓ ALMOÇOU</span>';
        }
      } else if (row.just) {
        statusBadge = this._justBadge(row.just);
      } else if (row.present) {
        statusBadge = '<span class="badge badge-danger">⚠️ PRESENTE S/ ALMOÇO</span>';
      } else {
        statusBadge = '<span class="badge badge-warning">⌛ PENDENTE</span>';
      }

      return `
      <tr>
        <td><strong>${this._esc(row.registration)}</strong></td>
        <td>${this._esc(row.name)}</td>
        <td>${this._esc(row.gradeTurma)}</td>
        <td>${row.entryTime}</td>
        <td>${row.mealTime} ${row.method !== '—' ? `<small style="color: var(--text-dim);">(${row.method})</small>` : ''}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
    }).join('');
  }

  // ========================================================================
  //  LEGACY REPORT TABLE (compatibility alias)
  // ========================================================================

  async loadReportTable(dateString, statusFilter) {
    return this.loadAuditTable();
  }

  // ========================================================================
  //  AI ENGINE — AUTOMATIC DIAGNOSTIC
  // ========================================================================

  async generateAIInsights() {
    const container = document.getElementById('ai-insights-container');
    if (!container) return;

    try {
      const allStudents = await window.studentService.getAllStudents();
      const activeStudents = allStudents.filter(s => s.active);
      const totalActive = activeStudents.length;

      if (totalActive === 0) {
        container.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.5); padding: 1.5rem;">Nenhum aluno ativo cadastrado no sistema.</div>';
        return;
      }

      const todayStr = window.mealValidatorService.getTodayDateString();

      let todayEntries = [];
      let todayMeals = [];
      try { todayEntries = await window.dbEngine.getAllByIndex('school_entries', 'entry_date', todayStr); } catch(e) {}
      try { todayMeals = await window.dbEngine.getAllByIndex('meal_logs', 'date', todayStr); } catch(e) {}

      const presentCount = todayEntries.length;
      const servedCount = todayMeals.length;
      const notServedCount = Math.max(0, presentCount - servedCount);
      const absentCount = Math.max(0, totalActive - presentCount);

      // Punctuality Analysis
      const presenceRate = totalActive > 0 ? ((presentCount / totalActive) * 100) : 0;
      const adhesionRate = presentCount > 0 ? ((servedCount / presentCount) * 100) : 0;
      const evasionRate = presentCount > 0 ? ((notServedCount / presentCount) * 100) : 0;

      let punctualityTag, punctualityText;
      if (presenceRate >= 85) {
        punctualityTag = '<span class="ai-tag ai-tag-green">✓ EXCELENTE</span>';
        punctualityText = `A presença escolar está em <strong>${presenceRate.toFixed(1)}%</strong> — excelente nível de pontualidade. ${presentCount} de ${totalActive} alunos ativos registraram entrada na portaria.`;
      } else if (presenceRate >= 65) {
        punctualityTag = '<span class="ai-tag ai-tag-yellow">⚠ ATENÇÃO</span>';
        punctualityText = `A presença está em <strong>${presenceRate.toFixed(1)}%</strong> — nível regular. ${absentCount} alunos não registraram entrada hoje. Recomenda-se investigar faltas recorrentes.`;
      } else {
        punctualityTag = '<span class="ai-tag ai-tag-red">✗ CRÍTICO</span>';
        punctualityText = `A presença está em apenas <strong>${presenceRate.toFixed(1)}%</strong> — nível crítico. ${absentCount} alunos ausentes. Pode indicar problemas de transporte, calendário ou eventos externos.`;
      }

      // Nutritional Adherence Analysis
      let nutritionTag, nutritionText;
      if (adhesionRate >= 80) {
        nutritionTag = '<span class="ai-tag ai-tag-green">✓ SAUDÁVEL</span>';
        nutritionText = `A taxa de adesão ao almoço escolar é de <strong>${adhesionRate.toFixed(1)}%</strong> — ótimo indicador nutricional. ${servedCount} alunos foram servidos no refeitório.`;
      } else if (adhesionRate >= 50) {
        nutritionTag = '<span class="ai-tag ai-tag-yellow">⚠ MODERADO</span>';
        nutritionText = `A taxa de adesão está em <strong>${adhesionRate.toFixed(1)}%</strong> — nível moderado. ${notServedCount} alunos presentes optaram por comida externa (iFood/marmita).`;
      } else {
        nutritionTag = '<span class="ai-tag ai-tag-red">✗ BAIXA ADESÃO</span>';
        nutritionText = `Apenas <strong>${adhesionRate.toFixed(1)}%</strong> dos presentes almoçaram no refeitório — evasão alimentar alta (${evasionRate.toFixed(1)}%). Sugere-se revisão do cardápio ou pesquisa de satisfação.`;
      }

      // Auto Recommendations
      const recommendations = [];
      if (absentCount > totalActive * 0.3) {
        recommendations.push('<span class="ai-tag ai-tag-red">Faltas Elevadas</span> Mais de 30% dos alunos não compareceram. Verificar ocorrência de feriado, evento ou problemas de transporte escolar.');
      }
      if (notServedCount > 10) {
        recommendations.push('<span class="ai-tag ai-tag-yellow">Evasão Alimentar</span> ' + notServedCount + ' alunos presentes não almoçaram no refeitório. Considere aplicar pesquisa sobre satisfação com o cardápio.');
      }
      if (servedCount > 0 && adhesionRate >= 90) {
        recommendations.push('<span class="ai-tag ai-tag-green">Cardápio Popular</span> Alta adesão indica boa aceitação do cardápio. Manter padrão atual e registrar o cardápio do dia como referência.');
      }
      if (presentCount > 0 && presentCount <= 20) {
        recommendations.push('<span class="ai-tag ai-tag-blue">Dia Atípico</span> Poucos alunos registrados na portaria hoje. Verificar se há atividade extraclasse, prova ou recesso parcial.');
      }
      if (recommendations.length === 0) {
        recommendations.push('<span class="ai-tag ai-tag-blue">Operação Normal</span> Todos os indicadores dentro da normalidade. Nenhuma ação urgente necessária.');
      }

      container.innerHTML = `
        <div class="ai-insight-block">
          <div class="ai-insight-label ai-label-punctuality">📊 Diagnóstico de Pontualidade ${punctualityTag}</div>
          <div class="ai-insight-text">${punctualityText}</div>
        </div>
        <div class="ai-insight-block">
          <div class="ai-insight-label ai-label-nutrition">🥗 Análise Nutricional (Adesão ao Almoço) ${nutritionTag}</div>
          <div class="ai-insight-text">${nutritionText}</div>
        </div>
        <div class="ai-insight-block">
          <div class="ai-insight-label ai-label-recommendation">💡 Recomendações Automáticas para a Gestão</div>
          <div class="ai-insight-text">
            ${recommendations.map(r => '<div style="margin-bottom: 0.5rem;">' + r + '</div>').join('')}
          </div>
        </div>
      `;
    } catch (err) {
      console.warn('⚠️ Erro ao gerar insights de IA:', err);
      container.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.5); padding: 1.5rem;">Erro ao gerar análise. Tente novamente.</div>';
    }
  }

  // ========================================================================
  //  RELATÓRIO EXECUTIVO (WORD .doc)
  // ========================================================================

  /**
   * Classifica o horário de chegada na portaria.
   * < 07:00:00 verde | 07:00:00–07:15:59 amarelo | >= 07:16:00 vermelho
   */
  _classifyArrival(entryTime) {
    const d = new Date(entryTime);
    const secs = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    if (secs < 7 * 3600) {
      return { key: 'early', bg: '#dcfce7', fg: '#166534', label: 'Antecipado / Pontual' };
    }
    if (secs < 7 * 3600 + 16 * 60) {
      return { key: 'tolerance', bg: '#fef9c3', fg: '#854d0e', label: 'Tolerância 15min' };
    }
    return { key: 'late', bg: '#fee2e2', fg: '#991b1b', label: 'Atrasado' };
  }

  /** Datas do período em horário LOCAL (YYYY-MM-DD). */
  _localPeriodRange(period) {
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const end = fmt(now);
    if (period === 'week') {
      const dow = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
      return { start: fmt(monday), end, label: 'Esta Semana', slug: 'Semana' };
    }
    if (period === 'month') {
      return { start: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), end, label: 'Este Mês', slug: 'Mes' };
    }
    return { start: end, end, label: 'Hoje', slug: 'Hoje' };
  }

  /** Busca registros de uma tabela no período: Supabase com fallback no IndexedDB. */
  async _fetchPeriodRecords(table, dateField, start, end) {
    if (window.supabaseClient && navigator.onLine) {
      try {
        const { data, error } = await window.supabaseClient
          .from(table)
          .select('*')
          .gte(dateField, start)
          .lte(dateField, end);
        if (!error && Array.isArray(data)) return data;
      } catch (e) {
        console.warn(`⚠️ Falha ao buscar ${table} no Supabase. Usando banco local:`, e);
      }
    }
    try {
      const all = await window.dbEngine.getAll(table);
      return all.filter(r => {
        const d = r[dateField] || r.entryDate;
        return d && d >= start && d <= end;
      });
    } catch (e) {
      return [];
    }
  }

  /**
   * Converte o logotipo da escola em Data URL (Base64) para embutir no documento Word.
   */
  async _getLogoBase64() {
    try {
      const response = await fetch('assets/img/logo.png');
      const blob = await response.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('⚠️ Falha ao carregar logo em Base64:', e);
      return '';
    }
  }

  async exportWordReport() {
    const logoDataUrl = await this._getLogoBase64();
    const period = this.currentPeriod || 'today';
    const { start, end, label, slug } = this._localPeriodRange(period);
    const esc = (v) => this._esc(v);
    const fmtTime = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const fmtDay = (ymd) => { const [y, m, d] = String(ymd).split('-'); return `${d}/${m}`; };
    const multiDay = start !== end;

    // 1. Dados
    const allStudents = await window.studentService.getAllStudents();
    const activeStudents = allStudents.filter(s => s.active);
    const studentById = new Map(activeStudents.map(s => [s.id, s]));

    const entries = await this._fetchPeriodRecords('school_entries', 'entry_date', start, end);
    const meals = await this._fetchPeriodRecords('meal_logs', 'date', start, end);

    // Refeições indexadas por (matrícula + data)
    const mealByRegDate = new Map();
    meals.forEach(m => {
      const reg = m.studentRegistration || m.student_registration;
      if (reg && m.date) mealByRegDate.set(`${reg}|${m.date}`, m);
    });

    // Justificativas (marmita / comida externa) — disponíveis via RPC apenas para hoje
    const justByReg = new Map();
    if (period === 'today' && window.supabaseClient && navigator.onLine) {
      try {
        const { data } = await window.supabaseClient.rpc('list_justifications_today');
        (data || []).forEach(j => justByReg.set(j.student_registration, j));
      } catch (e) {}
    }

    // 2. Cruzamento entradas x alunos, ordenado por horário de chegada (ASC)
    const presentRows = [];
    const presentIds = new Set();
    entries.forEach(e => {
      const sId = e.student_id || e.studentId;
      const st = studentById.get(sId);
      const entryTime = e.entry_time || e.entryTime;
      if (!st || !entryTime) return;
      presentIds.add(st.id);
      const entryDate = e.entry_date || e.entryDate;
      presentRows.push({
        student: st,
        entryTime,
        entryDate,
        meal: mealByRegDate.get(`${st.registration}|${entryDate}`) || null
      });
    });
    presentRows.sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

    const absentStudents = activeStudents
      .filter(s => !presentIds.has(s.id))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

    // 3. KPIs
    const totalStudents = activeStudents.length;
    const presentCount = presentIds.size;
    const assiduidade = totalStudents > 0 ? (presentCount / totalStudents) * 100 : 0;
    let early = 0, tolerance = 0, late = 0;
    presentRows.forEach(r => {
      const k = this._classifyArrival(r.entryTime).key;
      if (k === 'early') early++; else if (k === 'tolerance') tolerance++; else late++;
    });

    const isExternalStatus = (s) => s === 'marmita' || s === 'externa';
    const servedMeals = meals.filter(m => !isExternalStatus(m.meal_status || m.mealStatus));
    const servedCount = servedMeals.length;
    const externalFromLogs = meals.length - servedCount;
    const externalFromJust = [...justByReg.values()].filter(j => isExternalStatus(j.motivo)).length;
    const externalCount = externalFromLogs + externalFromJust;
    const adesao = presentRows.length > 0 ? (servedCount / presentRows.length) * 100 : 0;

    // 4. Linhas da tabela nominal
    const tdBase = 'border: 1px solid #cbd5e1; padding: 5px 7px; font-size: 9.5pt;';
    const rowsHtml = presentRows.map(r => {
      const c = this._classifyArrival(r.entryTime);
      const status = r.meal ? (r.meal.meal_status || r.meal.mealStatus) : null;
      const just = justByReg.get(r.student.registration);
      let situacao;
      if (r.meal && !isExternalStatus(status)) situacao = 'Almoçou no refeitório';
      else if (status === 'marmita' || (just && just.motivo === 'marmita')) situacao = 'Marmita';
      else if (status === 'externa' || (just && just.motivo === 'externa')) situacao = 'Comida externa';
      else if (just) situacao = `Justificou: ${just.motivo === 'outros' ? (just.notes || 'outros') : just.motivo}`;
      else situacao = 'Presente — não almoçou';

      const mealTime = r.meal && !isExternalStatus(status) && r.meal.timestamp ? fmtTime(r.meal.timestamp) : '—';
      const dayPrefix = multiDay ? `${fmtDay(r.entryDate)} ` : '';
      return `
        <tr>
          <td style="${tdBase}">${esc(r.student.registration)}</td>
          <td style="${tdBase}">${esc(r.student.name)}</td>
          <td style="${tdBase}">${esc(r.student.grade)} — ${esc(r.student.turma)}</td>
          <td style="${tdBase} background: ${c.bg}; color: ${c.fg}; font-weight: bold;">${dayPrefix}${fmtTime(r.entryTime)}<br><span style="font-size: 8pt; font-weight: normal;">${c.label}</span></td>
          <td style="${tdBase}">${multiDay && mealTime !== '—' ? fmtDay(r.entryDate) + ' ' : ''}${mealTime}</td>
          <td style="${tdBase}">${esc(situacao)}</td>
        </tr>`;
    }).join('') + absentStudents.map(s => `
        <tr>
          <td style="${tdBase}">${esc(s.registration)}</td>
          <td style="${tdBase}">${esc(s.name)}</td>
          <td style="${tdBase}">${esc(s.grade)} — ${esc(s.turma)}</td>
          <td style="${tdBase} color: #64748b;">Ausente / Sem registro</td>
          <td style="${tdBase}">—</td>
          <td style="${tdBase} color: #64748b;">Ausente / Sem registro</td>
        </tr>`).join('');

    // 5. Painel de KPIs (estilo Power BI)
    const kpi = (title, value, sub, bg, fg) => `
      <td style="width: 25%; padding: 6px;">
        <div style="background: ${bg}; border: 1px solid ${fg}33; border-radius: 10px; padding: 10px 12px;">
          <p style="margin: 0; font-size: 8.5pt; color: #475569; text-transform: uppercase;">${title}</p>
          <p style="margin: 2px 0 0; font-size: 20pt; font-weight: bold; color: ${fg};">${value}</p>
          <p style="margin: 0; font-size: 8.5pt; color: #64748b;">${sub}</p>
        </div>
      </td>`;

    const generatedAt = new Date().toLocaleString('pt-BR');
    const periodText = multiDay ? `${fmtDay(start)} a ${fmtDay(end)}/${end.slice(0, 4)}` : `${fmtDay(start)}/${start.slice(0, 4)}`;

    const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>Relatório Executivo CESD</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
  <style>
    @page WordSection1 { size: 21cm 29.7cm; margin: 1.6cm 1.4cm 1.6cm 1.4cm; }
    div.WordSection1 { page: WordSection1; }
    body { font-family: Calibri, Arial, sans-serif; color: #0f172a; }
    h1, h2, h3 { margin: 0; }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
<div class="WordSection1">

  <table style="width: 100%; border-bottom: 3px solid #1e3a8a; margin-bottom: 10px;">
    <tr>
      <td style="width: 75px; text-align: left; vertical-align: middle; padding-bottom: 8px;">
        <img src="${logoDataUrl}" width="65" height="65">
      </td>
      <td style="text-align: center; vertical-align: middle; padding-bottom: 8px;">
        <p style="margin: 0; font-size: 10pt; color: #475569; text-transform: uppercase; letter-spacing: 1px;">Governo do Estado de Sergipe • SEDUC</p>
        <p style="margin: 2px 0; font-size: 15pt; font-weight: bold; color: #1e3a8a;">Centro de Excelência Santos Dumont (CESD)</p>
        <p style="margin: 0; font-size: 12.5pt; font-weight: bold;">Relatório Executivo de Assiduidade e Alimentação Escolar</p>
        <p style="margin: 4px 0 0; font-size: 9.5pt; color: #64748b;">Período: <b>${label}</b> (${periodText}) • Gerado em ${generatedAt}</p>
      </td>
      <td style="width: 75px; padding-bottom: 8px;"></td>
    </tr>
  </table>

  <p style="font-size: 11.5pt; font-weight: bold; color: #1e3a8a; margin: 12px 0 4px;">📊 Visão Geral do Período</p>
  <table style="width: 100%;">
    <tr>
      ${kpi('Alunos Matriculados', totalStudents, 'Ativos no sistema', '#eff6ff', '#1d4ed8')}
      ${kpi('Presentes no Período', presentCount, `${assiduidade.toFixed(1)}% de assiduidade`, '#ecfeff', '#0e7490')}
      ${kpi('Almoços Servidos', servedCount, `${adesao.toFixed(1)}% de adesão`, '#f0fdf4', '#15803d')}
      ${kpi('Comida Externa / Marmitas', externalCount, period === 'today' ? 'Declarados pelos alunos' : 'Registros no período', '#faf5ff', '#7e22ce')}
    </tr>
    <tr>
      ${kpi('Antecipados (&lt; 07:00)', early, 'Chegadas pontuais', '#dcfce7', '#166534')}
      ${kpi('Tolerância (07:00–07:15)', tolerance, 'Dentro dos 15 min', '#fef9c3', '#854d0e')}
      ${kpi('Atrasos (&gt; 07:15)', late, 'Após a tolerância', '#fee2e2', '#991b1b')}
      ${kpi('Ausentes', absentStudents.length, 'Sem registro na portaria', '#f1f5f9', '#475569')}
    </tr>
  </table>

  <p style="font-size: 11.5pt; font-weight: bold; color: #1e3a8a; margin: 16px 0 4px;">📋 Relação Nominal por Ordem de Chegada</p>
  <p style="font-size: 8.5pt; color: #64748b; margin: 0 0 6px;">
    Legenda (Portaria):
    <span style="background: #dcfce7; color: #166534; padding: 1px 5px;">Antes das 07:00</span>
    <span style="background: #fef9c3; color: #854d0e; padding: 1px 5px;">07:00 às 07:15</span>
    <span style="background: #fee2e2; color: #991b1b; padding: 1px 5px;">A partir de 07:16</span>
  </p>
  <table style="width: 100%;">
    <thead>
      <tr style="background: #1e3a8a; color: #ffffff;">
        <th style="border: 1px solid #1e3a8a; padding: 6px; font-size: 9.5pt; text-align: left;">Matrícula</th>
        <th style="border: 1px solid #1e3a8a; padding: 6px; font-size: 9.5pt; text-align: left;">Nome Completo</th>
        <th style="border: 1px solid #1e3a8a; padding: 6px; font-size: 9.5pt; text-align: left;">Série / Turma</th>
        <th style="border: 1px solid #1e3a8a; padding: 6px; font-size: 9.5pt; text-align: left;">Horário (Portaria)</th>
        <th style="border: 1px solid #1e3a8a; padding: 6px; font-size: 9.5pt; text-align: left;">Horário (Refeitório)</th>
        <th style="border: 1px solid #1e3a8a; padding: 6px; font-size: 9.5pt; text-align: left;">Situação</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="6" style="${tdBase} text-align: center;">Nenhum aluno ativo cadastrado.</td></tr>`}
    </tbody>
  </table>

  <p style="font-size: 8pt; color: #94a3b8; margin-top: 14px; text-align: center;">
    Documento gerado automaticamente pelo Sistema de Refeitório QR — CESD.
  </p>
</div>
</body>
</html>`;

    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_Executivo_CESD_${slug}_${end}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }
}

const dashboardController = new DashboardController();
window.dashboardController = dashboardController;
