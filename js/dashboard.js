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
    if (!window.dbEngine || !window.mealValidatorService) return;

    const todayStr = window.mealValidatorService.getTodayDateString();

    let todayEntries = [];
    let todayMeals = [];
    let allStudents = [];

    try {
      todayEntries = await window.dbEngine.getAllByIndex('school_entries', 'entry_date', todayStr);
    } catch (e) {}
    try {
      todayMeals = await window.dbEngine.getAllByIndex('meal_logs', 'date', todayStr);
    } catch (e) {}
    try {
      allStudents = await window.studentService.getAllStudents();
    } catch (e) {}

    const studentMap = new Map(allStudents.map(s => [s.id, s]));
    const studentMapByReg = new Map(allStudents.map(s => [s.registration, s]));

    // Counters
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

    // Portaria Feed (sorted by most recent first)
    const portariaList = document.getElementById('tv-feed-portaria-list');
    if (portariaList) {
      const sorted = [...todayEntries].sort((a, b) => {
        return new Date(b.entry_time || b.entryTime).getTime() - new Date(a.entry_time || a.entryTime).getTime();
      });

      if (sorted.length === 0) {
        portariaList.innerHTML = '<div class="tv-feed-empty">Nenhum registro de entrada hoje</div>';
      } else {
        portariaList.innerHTML = sorted.map((entry, idx) => {
          const sId = entry.student_id || entry.studentId;
          const sObj = studentMap.get(sId);
          const name = entry.student_name || (sObj ? sObj.name : 'Aluno');
          const gradeTurma = sObj ? `${sObj.grade} — ${sObj.turma}` : '';
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

    // Refeitório Feed (sorted by most recent first)
    const refList = document.getElementById('tv-feed-refeitorio-list');
    if (refList) {
      const sortedMeals = [...todayMeals].sort((a, b) => {
        return new Date(b.timestamp || b.created_at).getTime() - new Date(a.timestamp || a.created_at).getTime();
      });

      if (sortedMeals.length === 0) {
        refList.innerHTML = '<div class="tv-feed-empty">Nenhum almoço registrado hoje</div>';
      } else {
        refList.innerHTML = sortedMeals.map((meal, idx) => {
          const reg = meal.studentRegistration || meal.student_registration;
          const sObj = studentMapByReg.get(reg);
          const name = meal.studentName || (sObj ? sObj.name : 'Aluno');
          const gradeTurma = sObj ? `${sObj.grade} — ${sObj.turma}` : '';
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
  //  CSV EXPORT
  // ========================================================================

  async exportReportCsv(dateString) {
    if (!dateString) dateString = window.mealValidatorService.getTodayDateString();

    const allStudents = await window.studentService.getAllStudents();
    const activeStudents = allStudents.filter(s => s.active);

    const mealsOnDate = await window.dbEngine.getAllByIndex('meal_logs', 'date', dateString);
    const mealMapByReg = new Map(mealsOnDate.map(m => [m.studentRegistration || m.student_registration, m]));

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
