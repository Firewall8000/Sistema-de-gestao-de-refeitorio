/* ==========================================================================
   SANTOS DUMONT - REFECTORY & PORTARIA SYSTEM
   Scanner Mode Validation Engine (Portaria x Refeitório)
   ========================================================================== */

class MealValidatorService {

  /**
   * Gets active scanner mode ('refeitorio' | 'portaria'). Default is 'refeitorio'.
   */
  getScannerMode() {
    return localStorage.getItem('cesd_scanner_mode') || 'refeitorio';
  }

  /**
   * Sets active scanner mode and updates UI elements accordingly.
   */
  setScannerMode(mode) {
    if (mode !== 'portaria' && mode !== 'refeitorio') mode = 'refeitorio';
    localStorage.setItem('cesd_scanner_mode', mode);
    this.updateScannerUIForMode(mode);
  }

  /**
   * Dynamically updates UI texts and active pill states based on scanner mode.
   */
  updateScannerUIForMode(mode) {
    const titleEl = document.getElementById('scanner-title');
    const subtitleEl = document.getElementById('scanner-subtitle');
    const counterLabelEl = document.getElementById('counter-today-label');

    const pillRefeitorio = document.getElementById('mode-pill-refeitorio');
    const pillPortaria = document.getElementById('mode-pill-portaria');

    if (pillRefeitorio && pillPortaria) {
      if (mode === 'portaria') {
        pillPortaria.classList.add('active');
        pillRefeitorio.classList.remove('active');
      } else {
        pillRefeitorio.classList.add('active');
        pillPortaria.classList.remove('active');
      }
    }

    if (mode === 'portaria') {
      if (titleEl) titleEl.textContent = '🚪 Registro de Entrada na Portaria';
      if (subtitleEl) subtitleEl.textContent = 'Aponte o QR Code da carteirinha para registrar a chegada do aluno';
      if (counterLabelEl) counterLabelEl.textContent = '📊 Entradas Registradas Hoje';
    } else {
      if (titleEl) titleEl.textContent = '📷 Validação de Almoço em Tempo Real';
      if (subtitleEl) subtitleEl.textContent = 'Aponte o QR Code para validar a entrega da merenda';
      if (counterLabelEl) counterLabelEl.textContent = '📊 Almoços Registrados Hoje';
    }

    this.updateTodayCounterUI();
    this.renderScannerQueueList();
  }

  /**
   * Returns current local ISO date string (YYYY-MM-DD).
   */
  getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Formats ISO timestamp to local time string HH:mm:ss.
   */
  formatTimeString(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString('pt-BR');
  }

  /**
   * Helper to map Supabase meal_logs columns to JS object.
   */
  _mapFromSupabase(data) {
    if (!data) return null;
    if (Array.isArray(data)) return data.map(item => this._mapFromSupabase(item));
    return {
      id: data.id,
      studentId: data.student_id || data.studentId,
      studentRegistration: data.student_registration || data.studentRegistration,
      studentName: data.student_name || data.studentName,
      turma: data.turma,
      grade: data.grade,
      date: data.date,
      timestamp: data.timestamp,
      qrTokenUsed: data.qr_token_used || data.qrTokenUsed,
      synced: data.synced !== undefined ? data.synced : true,
      validationMethod: data.validation_method || data.validationMethod,
      mealStatus: data.meal_status || data.mealStatus || null,
      notes: data.notes || null
    };
  }

  /**
   * Checks if student already had lunch today (Cloud + Local).
   */
  async getTodayMealForStudent(studentRegistration) {
    const today = this.getTodayDateString();

    if (window.supabaseClient && navigator.onLine) {
      try {
        const { data, error } = await window.supabaseClient
          .from('meal_logs')
          .select('*')
          .eq('date', today)
          .eq('student_registration', studentRegistration)
          .maybeSingle();

        if (!error && data) {
          return this._mapFromSupabase(data);
        }
      } catch (e) {}
    }

    try {
      const allTodayMeals = await window.dbEngine.getAllByIndex('meal_logs', 'date', today);
      return allTodayMeals.find(m => m.studentRegistration === studentRegistration) || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Counts total presencial meals served today (ignores ausente/marmita/externa).
   */
  async getTodayMealsCount() {
    try {
      const meals = await this.getTodayMealsAll();
      return meals.length;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Checks if student already registered entry today (Portaria mode).
   */
  async getTodayEntryForStudent(studentId) {
    const today = this.getTodayDateString();

    if (window.supabaseClient && navigator.onLine) {
      try {
        const { data, error } = await window.supabaseClient
          .from('school_entries')
          .select('*')
          .eq('entry_date', today)
          .eq('student_id', studentId)
          .maybeSingle();

        if (!error && data) {
          return data;
        }
      } catch (e) {}
    }

    try {
      const allTodayEntries = await window.dbEngine.getAllByIndex('school_entries', 'entry_date', today);
      return allTodayEntries.find(e => e.student_id === studentId || e.studentId === studentId) || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Counts total entries registered today (Portaria mode).
   */
  async getTodayEntriesCount() {
    const today = this.getTodayDateString();

    if (window.supabaseClient && navigator.onLine) {
      try {
        const { count, error } = await window.supabaseClient
          .from('school_entries')
          .select('*', { count: 'exact', head: true })
          .eq('entry_date', today);

        if (!error && count !== null) {
          return count;
        }
      } catch (e) {}
    }

    try {
      const entries = await window.dbEngine.getAllByIndex('school_entries', 'entry_date', today);
      return entries.length;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Returns today's portaria entries ordered by arrival time (ASC), one per student.
   * Index 0 = 1º lugar, index 1 = 2º lugar, etc.
   * Supabase (nuvem) + IndexedDB (fallback / registros offline ainda não sincronizados).
   */
  async getTodayOrderedEntries() {
    const today = this.getTodayDateString();
    let entries = [];

    if (window.supabaseClient && navigator.onLine) {
      try {
        const { data, error } = await window.supabaseClient
          .from('school_entries')
          .select('*')
          .eq('entry_date', today)
          .order('entry_time', { ascending: true });

        if (!error && Array.isArray(data)) entries = data.slice();
      } catch (e) {}
    }

    try {
      const local = await window.dbEngine.getAllByIndex('school_entries', 'entry_date', today);
      if (Array.isArray(local) && local.length) {
        const knownIds = new Set(entries.map(e => e.id));
        local.forEach(e => { if (!knownIds.has(e.id)) entries.push(e); });
      }
    } catch (e) {}

    const timeOf = (e) => {
      const t = new Date(e.entry_time || e.entryTime).getTime();
      return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
    };
    entries.sort((a, b) => timeOf(a) - timeOf(b));

    // Remove duplicatas por student_id (mantém a primeira chegada)
    const seen = new Set();
    return entries.filter(e => {
      const sId = e.student_id || e.studentId;
      if (!sId) return true;
      if (seen.has(sId)) return false;
      seen.add(sId);
      return true;
    });
  }

  /**
   * Returns ALL of today's meal_logs (presencial + marmita/externa), ordered by timestamp (ASC).
   * Supabase (nuvem) + IndexedDB (fallback / registros offline ainda não sincronizados).
   */
  async _fetchTodayMealsRaw() {
    const today = this.getTodayDateString();
    let meals = [];

    if (window.supabaseClient && navigator.onLine) {
      try {
        const { data, error } = await window.supabaseClient
          .from('meal_logs')
          .select('*')
          .eq('date', today);

        if (!error && Array.isArray(data)) meals = data.slice();
      } catch (e) {}
    }

    try {
      const local = await window.dbEngine.getAllByIndex('meal_logs', 'date', today);
      if (Array.isArray(local) && local.length) {
        const knownIds = new Set(meals.map(m => m.id));
        local.forEach(m => { if (!knownIds.has(m.id)) meals.push(m); });
      }
    } catch (e) {}

    const timeOf = (m) => {
      const t = new Date(m.timestamp || m.created_at).getTime();
      return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
    };
    meals.sort((a, b) => timeOf(a) - timeOf(b));
    return meals;
  }

  /**
   * true = aluno marcado como ausente na fila do almoço (não trava a fila e não conta como refeição servida).
   */
  _isAbsentMeal(meal) {
    if (!meal) return false;
    const status = String(meal.meal_status || meal.mealStatus || '').toLowerCase();
    const method = String(meal.validation_method || meal.validationMethod || '').toUpperCase();
    return status === 'ausente' || method === 'AUSENTE';
  }

  /**
   * true = refeição presencial no refeitório; false = ausência ou apenas justificativa externa (marmita / externa).
   */
  _isPresencialMeal(meal) {
    if (!meal || this._isAbsentMeal(meal)) return false;
    const status = meal.meal_status || meal.mealStatus;
    return !(status === 'marmita' || status === 'externa');
  }

  /**
   * Returns today's presencial meals (almoços liberados no refeitório), ignoring marmita/externa/ausente.
   */
  async getTodayMealsAll() {
    const meals = await this._fetchTodayMealsRaw();
    return meals.filter(m => this._isPresencialMeal(m));
  }

  /**
   * Cross-references ordered entries with today's meals.
   * - findMeal(entry): refeição presencial do aluno (ou null = Pendente)
   * - isExternal(entry): aluno com marmita/externa (não almoça no refeitório, não trava a fila)
   * - isAbsent(entry): aluno marcado como ausente na fila (não almoça no refeitório, não trava a fila)
   * - nextIdx: índice do primeiro aluno ainda Pendente (-1 se ninguém)
   */
  _computeQueueState(orderedEntries, rawMeals, studentMapById = new Map()) {
    const servedByKey = new Map();
    const externalKeys = new Set();
    const absentKeys = new Set();

    (rawMeals || []).forEach(m => {
      const keys = [m.student_id || m.studentId, m.student_registration || m.studentRegistration].filter(Boolean);
      if (this._isAbsentMeal(m)) {
        keys.forEach(k => absentKeys.add(k));
      } else if (this._isPresencialMeal(m)) {
        keys.forEach(k => { if (!servedByKey.has(k)) servedByKey.set(k, m); });
      } else {
        keys.forEach(k => externalKeys.add(k));
      }
    });

    const keysOf = (entry) => {
      const sId = entry.student_id || entry.studentId;
      const sObj = sId && studentMapById ? studentMapById.get(sId) : null;
      const reg = entry.student_registration || entry.studentRegistration || (sObj ? sObj.registration : null);
      return [sId, reg].filter(Boolean);
    };

    const findMeal = (entry) => {
      for (const k of keysOf(entry)) {
        if (servedByKey.has(k)) return servedByKey.get(k);
      }
      return null;
    };

    const isExternal = (entry) => keysOf(entry).some(k => externalKeys.has(k));
    const isAbsent = (entry) => keysOf(entry).some(k => absentKeys.has(k));

    const nextIdx = (orderedEntries || []).findIndex(e => !findMeal(e) && !isExternal(e) && !isAbsent(e));

    return { findMeal, isExternal, isAbsent, nextIdx };
  }

  /**
   * Primary entry point for validating and recording scan or manual attempt based on active mode.
   * accepts { qrToken } or { registration }
   */
  async validateAndRecordMeal({ qrToken, registration }) {
    const mode = this.getScannerMode();
    if (mode === 'portaria') {
      return await this.recordPortariaEntry({ qrToken, registration });
    } else {
      return await this.recordRefeitorioMeal({ qrToken, registration });
    }
  }

  /**
   * MODO PORTARIA (Entrada): Registra o horário de chegada do aluno na escola na tabela `school_entries`.
   */
  async recordPortariaEntry({ qrToken, registration }) {
    let student = null;
    let method = 'qr_code';

    if (qrToken) {
      student = await window.studentService.getByQrToken(qrToken);
      method = 'qr_code';
    } else if (registration) {
      student = await window.studentService.getByRegistration(registration);
      method = 'manual';
    }

    // 1. Localize o aluno na tabela students (pelo qr_token ou registration) garantindo que active = true. Se não encontrar, exiba o modal de erro de "Aluno não encontrado ou inativo".
    if (!student || !student.active) {
      this.displayValidationResult({
        success: false,
        title: 'ALUNO NÃO ENCONTRADO OU INATIVO',
        detail: student ? `${student.name} — ${student.grade} (${student.turma})` : 'Nenhum estudante ativo localizado.',
        sub: 'Aluno não foi encontrado ou está inativo no sistema.'
      });

      if (typeof window.showAlertModal === 'function') {
        await window.showAlertModal({
          title: 'Aluno não encontrado ou inativo',
          message: 'Aluno não foi encontrado ou está inativo no sistema.',
          type: 'danger'
        });
      }
      return false;
    }

    const todayDate = this.getTodayDateString();
    const nowIso = new Date().toISOString();

    // Local check for duplicity
    const existingEntry = await this.getTodayEntryForStudent(student.id);
    if (existingEntry) {
      const entryTimeFormatted = this.formatTimeString(existingEntry.entry_time || existingEntry.entryTime || existingEntry.timestamp);
      let dupPos = 0;
      try {
        const dupEntries = await this.getTodayOrderedEntries();
        const idx = dupEntries.findIndex(e => (e.student_id || e.studentId) === student.id);
        if (idx !== -1) dupPos = idx + 1;
      } catch (e) {}
      const dupMsg = dupPos > 0
        ? `Entrada já registrada hoje às ${entryTimeFormatted} — Colocação na fila do almoço: ${dupPos}º lugar`
        : `Entrada já registrada hoje às ${entryTimeFormatted}.`;

      this.displayValidationResult({
        success: false,
        title: 'CHECK-IN JÁ REALIZADO HOJE!',
        detail: `${student.name} — ${student.grade} (${student.turma})`,
        sub: dupMsg
      });

      if (typeof window.showAlertModal === 'function') {
        await window.showAlertModal({
          title: 'Check-in Duplicado',
          message: `Check-in já realizado hoje para este aluno!\n\n${dupMsg}`,
          type: 'warning'
        });
      }
      return false;
    }

    // 2. Insira o registro na tabela public.school_entries
    const entryRecord = {
      id: 'entry-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      student_id: student.id,
      student_name: student.name,
      turma: student.turma,
      entry_date: todayDate,
      entry_time: nowIso,
      entry_method: method
    };

    // 3. Tratamento de duplicidade de chave única (código PostgreSQL 23505 ou constraint unique_student_entry_per_day)
    if (window.supabaseClient && navigator.onLine) {
      try {
        const { error } = await window.supabaseClient.from('school_entries').insert(entryRecord);
        if (error) {
          if (error.code === '23505' || (error.message && (error.message.includes('unique_student_entry_per_day') || error.message.toLowerCase().includes('unique')))) {
            console.warn('⚠️ Check-in duplicado no Supabase:', student.registration);
            this.displayValidationResult({
              success: false,
              title: 'CHECK-IN JÁ REALIZADO HOJE!',
              detail: `${student.name} — ${student.grade} (${student.turma})`,
              sub: 'Check-in já realizado hoje para este aluno!'
            });

            if (typeof window.showAlertModal === 'function') {
              await window.showAlertModal({
                title: 'Check-in Duplicado',
                message: 'Check-in já realizado hoje para este aluno!',
                type: 'warning'
              });
            }
            return false;
          }
        }
      } catch (err) {
        console.warn('⚠️ Falha ao registrar entrada no Supabase Cloud:', err);
      }
    }

    try {
      await window.dbEngine.put('school_entries', entryRecord);
    } catch (e) {}

    // 4. Sucesso: Exiba o modal de sucesso informando o nome do aluno, turma e o horário de chegada formatado (HH:mm:ss). Atualize o contador de entradas do dia.
    const formattedTime = this.formatTimeString(nowIso);

    // Colocação exata na fila do almoço (ordem de chegada)
    let pos = 0;
    try {
      const entries = await this.getTodayOrderedEntries();
      const idx = entries.findIndex(e => (e.student_id || e.studentId) === student.id);
      pos = idx !== -1 ? idx + 1 : entries.length;
    } catch (e) {}
    if (!pos) pos = 1;
    const loteLabel = pos <= 150
      ? `${pos}º da Fila (1º Lote • 1 a 150)`
      : `${pos}º da Fila (2º Lote • 151+)`;

    this.displayValidationResult({
      success: true,
      title: 'ENTRADA REGISTRADA ✓ — ' + pos + 'º DA FILA',
      detail: `${student.name} — ${student.grade} ${student.turma}`,
      sub: `Colocação para o almoço: ${pos}º lugar • Chegada às ${formattedTime}`
    });

    await this.updateTodayCounterUI();

    if (typeof window.showAlertModal === 'function') {
      await window.showAlertModal({
        title: `Entrada Registrada — ${loteLabel}`,
        message: `Entrada registrada com sucesso!\n\n🏅 Colocação na Fila do Almoço: ${pos}º lugar ${pos > 150 ? '(2º Lote)' : '(Prioridade 1–150)'}\nAluno: ${student.name}\nTurma: ${student.grade} - ${student.turma}\nHorário: ${formattedTime}`,
        type: 'success'
      });
    }

    return true;
  }

  /**
   * MODO REFEITÓRIO (Almoço): Mantém o fluxo atual, validando e registrando a refeição na tabela `meal_logs`.
   */
  async recordRefeitorioMeal({ qrToken, registration }) {
    let student = null;
    let method = 'CAMERA';

    if (qrToken) {
      student = await window.studentService.getByQrToken(qrToken);
      method = 'CAMERA';
    } else if (registration) {
      student = await window.studentService.getByRegistration(registration);
      method = 'MANUAL';
    }

    if (!student) {
      this.displayValidationResult({
        success: false,
        title: 'CÓDIGO / MATRÍCULA INVÁLIDA',
        detail: 'Nenhum estudante foi encontrado com os dados apresentados.',
        sub: 'Verifique se o crachá pertence à escola ou solicite segunda via na Secretaria.'
      });
      if (typeof window.showAlertModal === 'function') {
        await window.showAlertModal({
          title: 'Aluno não encontrado',
          message: 'Aluno não foi encontrado com os dados apresentados.',
          type: 'danger'
        });
      }
      return false;
    }

    if (!student.active) {
      this.displayValidationResult({
        success: false,
        title: 'ALUNO INATIVO / BLOQUEADO',
        detail: `${student.name} — ${student.grade} (${student.turma})`,
        sub: 'Este aluno está marcado como inativo no sistema. Procure a secretaria.'
      });
      if (typeof window.showAlertModal === 'function') {
        await window.showAlertModal({
          title: 'Aluno Inativo',
          message: 'Aluno está marcado como inativo no sistema.',
          type: 'danger'
        });
      }
      return false;
    }

    // Verificação obrigatória: o aluno precisa ter entrada registrada na portaria hoje
    // (school_entries.entry_date === todayStr). Busca no Supabase com fallback no IndexedDB,
    // já ordenada por horário de chegada (índice 0 = 1º lugar).
    const orderedEntries = await this.getTodayOrderedEntries();
    const studentIdx = orderedEntries.findIndex(e => (e.student_id || e.studentId) === student.id);

    if (studentIdx === -1) {
      // displayValidationResult com success:false toca o áudio de erro
      this.displayValidationResult({
        success: false,
        title: 'ENTRADA NÃO REGISTRADA NA PORTARIA',
        detail: `${student.name} — ${student.grade} (${student.turma})`,
        sub: 'O aluno não registrou entrada na portaria hoje. Almoço bloqueado.'
      });
      if (!document.getElementById('validation-banner') && window.audioFeedback) {
        window.audioFeedback.playErrorSound();
      }

      if (typeof window.showAlertModal === 'function') {
        await window.showAlertModal({
          title: 'Entrada não registrada na portaria',
          message: `A entrada de ${student.name} não foi registrada na portaria hoje.\n\nO almoço só pode ser liberado após o registro de entrada na portaria.`,
          type: 'danger'
        });
      }
      return { success: false, reason: 'no_gate_entry' };
    }

    const studentPos = studentIdx + 1;

    // Single-meal check & unique_student_meal_per_date error handling
    const existingMeal = await this.getTodayMealForStudent(student.registration);

    if (existingMeal) {
      const mealTime = this.formatTimeString(existingMeal.timestamp);
      if (this._isAbsentMeal(existingMeal)) {
        this.displayValidationResult({
          success: false,
          title: 'ALUNO MARCADO COMO AUSENTE! (' + studentPos + 'º DA FILA)',
          detail: `${student.name} — ${student.grade} (${student.turma})`,
          sub: `Ausência registrada às ${mealTime} (${studentPos}º da fila). A fila já avançou.`
        });

        if (typeof window.showAlertModal === 'function') {
          await window.showAlertModal({
            title: 'Aluno Marcado como Ausente',
            message: `O aluno ${student.name} (${studentPos}º da fila) foi marcado como ausente no refeitório às ${mealTime}.`,
            type: 'warning'
          });
        }
        return { success: false, reason: 'marked_absent' };
      }

      this.displayValidationResult({
        success: false,
        title: 'ALMOÇO JÁ REGISTRADO HOJE!',
        detail: `${student.name} — ${student.grade} (${student.turma})`,
        sub: `Refeição já concedida hoje às ${mealTime} (${studentPos}º da fila). Bloqueado segundo a RN-001.`
      });

      if (typeof window.showAlertModal === 'function') {
        await window.showAlertModal({
          title: 'Almoço Já Registrado',
          message: `Este aluno já realizou a refeição hoje!\n\nEle era o ${studentPos}º da fila.`,
          type: 'warning'
        });
      }
      return false;
    }

    // TRAVA DE BARRAMENTO ESTRITO SEQUENCIAL (1 POR 1):
    // só libera o primeiro aluno da ordem de chegada que ainda está "Pendente".
    // (refeições presenciais de hoje = getTodayMealsAll(); marmita/externa não travam a fila)
    const rawMeals = await this._fetchTodayMealsRaw();
    const lockStudentMap = new Map([[student.id, student]]);
    try {
      const allStudents = await window.studentService.getAllStudents();
      (allStudents || []).forEach(s => { if (!lockStudentMap.has(s.id)) lockStudentMap.set(s.id, s); });
    } catch (e) {}
    const queue = this._computeQueueState(orderedEntries, rawMeals, lockStudentMap);
    const nextIdx = queue.nextIdx;
    const nextEntry = nextIdx !== -1 ? orderedEntries[nextIdx] : null;
    const nextPos = nextIdx + 1;

    if (nextEntry && (nextEntry.student_id || nextEntry.studentId) !== student.id) {
      this.displayValidationResult({
        success: false,
        title: 'FORA DA ORDEM DA FILA! (' + studentPos + 'º LUGAR)',
        detail: `${student.name} — ${student.grade} (${student.turma})`,
        sub: `A vez atual é do ${nextPos}º da fila: ${window.studentService.getDisplayName(nextEntry, lockStudentMap.get(nextEntry.student_id || nextEntry.studentId))} (${nextEntry.turma || ''}).`
      });

      if (typeof window.showAlertModal === 'function') {
        await window.showAlertModal({
          title: 'Aguarde a sua Vez na Fila',
          message: `O aluno ${student.name} está na ${studentPos}ª colocação de chegada.\n\nNo momento, o leitor aguarda o ${nextPos}º da fila:\n👉 ${window.studentService.getDisplayName(nextEntry, lockStudentMap.get(nextEntry.student_id || nextEntry.studentId))} (${nextEntry.turma || ''})\n\nO atendimento segue rigorosamente a ordem de chegada na escola.`,
          type: 'warning'
        });
      }
      return { success: false, reason: 'out_of_order' };
    }

    const nowIso = new Date().toISOString();
    const mealLog = {
      id: 'meal-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      studentId: student.id,
      studentRegistration: student.registration,
      studentName: student.name,
      turma: student.turma,
      grade: student.grade,
      date: this.getTodayDateString(),
      timestamp: nowIso,
      qrTokenUsed: student.qrToken,
      synced: navigator.onLine,
      validationMethod: method
    };

    if (window.supabaseClient && navigator.onLine) {
      try {
        const row = {
          id: mealLog.id,
          student_id: mealLog.studentId,
          student_registration: mealLog.studentRegistration,
          student_name: mealLog.studentName,
          turma: mealLog.turma,
          grade: mealLog.grade,
          date: mealLog.date,
          timestamp: mealLog.timestamp,
          qr_token_used: mealLog.qrTokenUsed,
          synced: true,
          validation_method: mealLog.validationMethod
        };

        const { error } = await window.supabaseClient.from('meal_logs').insert(row);

        if (error) {
          if (error.code === '23505' || (error.message && (error.message.includes('unique_student_meal_per_date') || error.message.toLowerCase().includes('unique')))) {
            console.warn('⚠️ Tentativa de refeição duplicada detectada:', student.registration);
            this.displayValidationResult({
              success: false,
              title: 'ALMOÇO JÁ REGISTRADO HOJE!',
              detail: `${student.name} — ${student.grade} (${student.turma})`,
              sub: 'Este aluno já realizou a refeição hoje!'
            });

            if (typeof window.showAlertModal === 'function') {
              await window.showAlertModal({
                title: 'Almoço Já Registrado',
                message: 'Este aluno já realizou a refeição hoje!',
                type: 'warning'
              });
            }
            return false;
          }
        }
      } catch (err) {
        console.warn('⚠️ Falha ao registrar refeição no Supabase:', err);
      }
    }

    await window.dbEngine.put('meal_logs', mealLog);

    // Verifica se o(s) aluno(s) imediatamente seguinte(s) na fila já foram marcados como AUSENTE
    // pela Coordenação/Diretoria, pulando-os automaticamente e avisando no banner/modal.
    const skippedAbsent = [];
    let scanIdx = studentIdx + 1;
    while (scanIdx < orderedEntries.length) {
      const nextCand = orderedEntries[scanIdx];
      if (queue.isAbsent(nextCand)) {
        const candId = nextCand.student_id || nextCand.studentId;
        const candStudent = lockStudentMap.get(candId);
        const candName = window.studentService.getDisplayName(nextCand, candStudent);
        skippedAbsent.push(`${scanIdx + 1}º (${candName})`);
        scanIdx++;
      } else if (queue.findMeal(nextCand) || queue.isExternal(nextCand)) {
        scanIdx++;
      } else {
        break;
      }
    }

    let skippedNotice = '';
    if (skippedAbsent.length > 0) {
      const nextPendingPos = scanIdx < orderedEntries.length ? (scanIdx + 1) : null;
      const skippedLabel = skippedAbsent.length === 1
        ? `${skippedAbsent[0]} ausente`
        : `${skippedAbsent.join(', ')} ausentes`;
      skippedNotice = nextPendingPos
        ? `${skippedLabel} — próximo da fila: ${nextPendingPos}º lugar`
        : `${skippedLabel} — fila concluída`;
    }

    this.displayValidationResult({
      success: true,
      title: 'ALMOÇO LIBERADO ✓ (' + studentPos + 'º DA FILA)',
      detail: `${student.name} — ${student.grade} ${student.turma}`,
      sub: `${studentPos}º da fila • Matrícula: ${student.registration} • Liberado às ${this.formatTimeString(nowIso)} (${method})${skippedNotice ? ' • ' + skippedNotice : ''}`
    });

    await this.updateTodayCounterUI();

    if (typeof window.showAlertModal === 'function') {
      await window.showAlertModal({
        title: 'Almoço Liberado',
        message: `Almoço liberado com sucesso!\n\n🏅 Posição na Fila: ${studentPos}º lugar\nAluno: ${student.name}\nTurma: ${student.grade} - ${student.turma}\nHorário de Liberação: ${this.formatTimeString(nowIso)}${skippedNotice ? '\n\n⏭️ ' + skippedNotice : ''}`,
        type: 'success'
      });
    }

    return true;
  }

  /**
   * Marca um aluno da fila como AUSENTE no almoço (exclusivo Coordenação / Diretoria)
   * para destravar a fila sequencial.
   * Assinatura: markStudentAbsentFromQueue(studentId, studentName, position)
   */
  async markStudentAbsentFromQueue(studentId, studentNameArg = null, positionArg = null) {
    if (!studentId) return false;

    const isOpts = studentNameArg && typeof studentNameArg === 'object';
    const skipConfirm = isOpts ? !!studentNameArg.skipConfirm : false;
    const passedName = (!isOpts && typeof studentNameArg === 'string' && studentNameArg.trim()) ? studentNameArg.trim() : null;
    const passedPos = (!isOpts && Number.isFinite(Number(positionArg)) && Number(positionArg) > 0) ? Number(positionArg) : null;

    const orderedEntries = await this.getTodayOrderedEntries();
    const studentIdx = orderedEntries.findIndex(e => (e.student_id || e.studentId) === studentId);
    const entry = studentIdx !== -1 ? orderedEntries[studentIdx] : null;
    const studentPos = studentIdx !== -1 ? (studentIdx + 1) : (passedPos || null);

    let student = null;
    try {
      const allStudents = await window.studentService.getAllStudents();
      student = (allStudents || []).find(s => s.id === studentId) || null;
    } catch (e) {}

    if (!entry && !student) return false;

    const studentName = window.studentService.getDisplayName(entry || { student_name: passedName }, student);
    const registration = (student && student.registration) || (entry && (entry.student_registration || entry.registration)) || studentId;
    const turma = (student && student.turma) || (entry && entry.turma) || '—';
    const grade = (student && student.grade) || (entry && entry.grade) || '—';
    const qrToken = (student && student.qrToken) || 'AUSENTE';
    const posLabel = studentPos ? `${studentPos}º da fila — ` : '';

    if (!skipConfirm && typeof window.showConfirmModal === 'function') {
      const confirmed = await window.showConfirmModal({
        title: 'Confirmar Ausência na Fila',
        message: `Deseja marcar o aluno ${studentName} (${posLabel}${grade} ${turma}) como AUSENTE no almoço?\n\nA vez passará automaticamente para o próximo aluno pendente da fila.`,
        icon: '🚫',
        confirmText: 'Sim, Marcar Ausência',
        cancelText: 'Cancelar',
        isDanger: true
      });
      if (!confirmed) return false;
    }

    const todayStr = this.getTodayDateString();
    const nowIso = new Date().toISOString();
    const absentLog = {
      id: 'absent-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      studentId,
      studentRegistration: registration,
      studentName,
      turma,
      grade,
      date: todayStr,
      timestamp: nowIso,
      qrTokenUsed: qrToken,
      synced: navigator.onLine,
      validationMethod: 'AUSENTE',
      mealStatus: 'ausente'
    };

    if (window.supabaseClient && navigator.onLine) {
      try {
        const row = {
          id: absentLog.id,
          student_id: absentLog.studentId,
          student_registration: absentLog.studentRegistration,
          student_name: absentLog.studentName,
          turma: absentLog.turma,
          grade: absentLog.grade,
          date: absentLog.date,
          timestamp: absentLog.timestamp,
          qr_token_used: absentLog.qrTokenUsed,
          synced: true,
          validation_method: 'AUSENTE'
        };
        await window.supabaseClient.from('meal_logs').insert(row);
      } catch (err) {
        console.warn('⚠️ Falha ao registrar ausência na fila no Supabase:', err);
      }
    }

    try {
      await window.dbEngine.put('meal_logs', absentLog);
    } catch (e) {}

    await this.updateTodayCounterUI();
    if (window.dashboardController) {
      Promise.resolve(window.dashboardController.refreshTvFeed()).catch(() => {});
      Promise.resolve(window.dashboardController.refreshDashboardForPeriod()).catch(() => {});
    }

    return true;
  }

  /**
   * Renders the validation banner overlay and plays synthetic audio feedback.
   */
  displayValidationResult({ success, title, detail, sub }) {
    const banner = document.getElementById('validation-banner');
    const icon = document.getElementById('val-icon');
    const titleEl = document.getElementById('val-title');
    const detailEl = document.getElementById('val-detail');
    const subEl = document.getElementById('val-sub');

    if (!banner) return;

    banner.style.display = 'flex';

    if (success) {
      banner.className = 'validation-banner success';
      if (icon) icon.textContent = '✓';
      if (window.audioFeedback) window.audioFeedback.playSuccessSound();
    } else {
      banner.className = 'validation-banner danger';
      if (icon) icon.textContent = '✕';
      if (window.audioFeedback) window.audioFeedback.playErrorSound();
    }

    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail;
    if (subEl) subEl.textContent = sub;

    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Updates today's counter badge in UI based on active scanner mode.
   */
  async updateTodayCounterUI() {
    const counterEl = document.getElementById('counter-today-meals');
    if (counterEl) {
      const mode = this.getScannerMode();
      if (mode === 'portaria') {
        const count = await this.getTodayEntriesCount();
        counterEl.textContent = count;
      } else {
        const count = await this.getTodayMealsCount();
        counterEl.textContent = count;
      }
    }

    if (window.dashboardController) {
      window.dashboardController.refreshTodayMetrics();
      window.dashboardController.loadLunchQueueTable();
    }

    await this.renderScannerQueueList();
  }

  /**
   * HTML Entity Escape helper against XSS (delegates to the global _esc from app.js).
   */
  _esc(v) {
    if (typeof window._esc === 'function') return window._esc(v);
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Renders the live arrival-order queue (#scanner-queue-tbody) on the scanner tab:
   * 1º no topo até o último embaixo, apenas para visualização de status (sem botões de ausência).
   */
  async renderScannerQueueList() {
    const revision = this._scannerQueueRevision = (this._scannerQueueRevision || 0) + 1;
    const tbody = document.getElementById('scanner-queue-tbody');
    const summaryEl = document.getElementById('scanner-queue-summary');
    if (!tbody && !summaryEl) return;

    let orderedEntries = [];
    let rawMeals = [];
    let allStudents = [];
    try { orderedEntries = await this.getTodayOrderedEntries(); } catch (e) {}
    try { rawMeals = await this._fetchTodayMealsRaw(); } catch (e) {}
    try { allStudents = await window.studentService.getAllStudents(); } catch (e) {}

    const studentMapById = new Map((allStudents || []).map(s => [s.id, s]));
    const queue = this._computeQueueState(orderedEntries, rawMeals, studentMapById);
    if (revision !== this._scannerQueueRevision) return;

    const servedCount = orderedEntries.filter(e => !!queue.findMeal(e)).length;
    const externalCount = orderedEntries.filter(e => !queue.findMeal(e) && queue.isExternal(e)).length;
    const absentCount = orderedEntries.filter(e => !queue.findMeal(e) && queue.isAbsent(e)).length;
    const pendingCount = Math.max(0, orderedEntries.length - servedCount - externalCount - absentCount);

    if (summaryEl) {
      summaryEl.textContent = absentCount > 0
        ? `${orderedEntries.length} chegaram • ${servedCount} liberados • ${pendingCount} pendentes • ${absentCount} ausentes`
        : `${orderedEntries.length} chegaram • ${servedCount} liberados • ${pendingCount} pendentes`;
    }

    if (!tbody) return;

    if (orderedEntries.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
            Nenhum aluno registrado na portaria hoje.
          </td>
        </tr>
      `;
      return;
    }

    const esc = (v) => this._esc(v);

    tbody.innerHTML = orderedEntries.map((entry, idx) => {
      const pos = idx + 1;
      const sId = entry.student_id || entry.studentId;
      const sObj = studentMapById.get(sId);
      const registration = sObj ? sObj.registration : (entry.student_registration || entry.registration || '—');
      const name = window.studentService.getDisplayName(entry, sObj);
      const gradeTurma = sObj ? `${sObj.grade} — ${sObj.turma}` : (entry.turma || '—');
      const entryTime = this.formatTimeString(entry.entry_time || entry.entryTime);

      let posBadge;
      if (pos <= 150) {
        posBadge = `<span class="badge ${pos <= 3 ? 'badge-warning' : 'badge-info'}" style="font-weight: 800;">${esc(pos + 'º')}</span>`;
      } else {
        posBadge = `<span class="badge" style="font-weight: 800; background: rgba(148,163,184,0.2); color: #cbd5e1;">${esc(pos + 'º')}</span> <small style="color: var(--text-dim);">2º Lote</small>`;
      }

      const meal = queue.findMeal(entry);
      const isNext = idx === queue.nextIdx;
      let statusBadge;
      if (meal) {
        const mealTimeFormatted = this.formatTimeString(meal.timestamp || meal.created_at);
        statusBadge = `<span class="badge badge-success">✓ Liberado • ${esc(mealTimeFormatted)}</span>`;
      } else if (queue.isAbsent(entry)) {
        statusBadge = '<span class="badge badge-danger">🚫 Ausente no Almoço</span>';
      } else if (queue.isExternal(entry)) {
        statusBadge = '<span class="badge" style="background: rgba(59,130,246,0.2); color: #60a5fa;">🍱 Refeição externa</span>';
      } else if (isNext) {
        statusBadge = '<span class="badge badge-info">👉 Próximo da Vez • ⏳ Pendente</span>';
      } else {
        statusBadge = '<span class="badge badge-warning">⏳ Pendente</span>';
      }

      return `
        <tr${isNext ? ' style="background: rgba(6, 182, 212, 0.08);"' : ''}>
          <td style="text-align: center;">${posBadge}</td>
          <td><strong>${esc(registration)}</strong></td>
          <td>${esc(name)}</td>
          <td>${esc(gradeTurma)}</td>
          <td>${esc(entryTime)}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');
  }
}

const mealValidatorService = new MealValidatorService();
window.mealValidatorService = mealValidatorService;
window.mealService = mealValidatorService;
window.markStudentAbsentFromQueue = (studentId, studentName, position) =>
  mealValidatorService.markStudentAbsentFromQueue(studentId, studentName, position);
