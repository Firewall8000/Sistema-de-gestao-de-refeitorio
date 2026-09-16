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
      validationMethod: data.validation_method || data.validationMethod
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
   * Counts total meals served today.
   */
  async getTodayMealsCount() {
    const today = this.getTodayDateString();

    if (window.supabaseClient && navigator.onLine) {
      try {
        const { count, error } = await window.supabaseClient
          .from('meal_logs')
          .select('*', { count: 'exact', head: true })
          .eq('date', today);

        if (!error && count !== null) {
          return count;
        }
      } catch (e) {}
    }

    try {
      const meals = await window.dbEngine.getAllByIndex('meal_logs', 'date', today);
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
      this.displayValidationResult({
        success: false,
        title: 'CHECK-IN JÁ REALIZADO HOJE!',
        detail: `${student.name} — ${student.grade} (${student.turma})`,
        sub: `Entrada já registrada hoje às ${entryTimeFormatted}.`
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

    this.displayValidationResult({
      success: true,
      title: 'ENTRADA REGISTRADA ✓',
      detail: `${student.name} — ${student.grade} ${student.turma}`,
      sub: `Chegada registrada às ${formattedTime} (${method === 'qr_code' ? 'QR Code' : 'Manual'})`
    });

    await this.updateTodayCounterUI();

    if (typeof window.showAlertModal === 'function') {
      await window.showAlertModal({
        title: 'Entrada Registrada',
        message: `Entrada registrada com sucesso!\n\nAluno: ${student.name}\nTurma: ${student.turma}\nHorário: ${formattedTime}`,
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

    // Single-meal check & unique_student_meal_per_date error handling
    const existingMeal = await this.getTodayMealForStudent(student.registration);

    if (existingMeal) {
      const mealTime = this.formatTimeString(existingMeal.timestamp);
      this.displayValidationResult({
        success: false,
        title: 'ALMOÇO JÁ REGISTRADO HOJE!',
        detail: `${student.name} — ${student.grade} (${student.turma})`,
        sub: `Refeição já concedida hoje às ${mealTime}. Bloqueado segundo a RN-001.`
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

    this.displayValidationResult({
      success: true,
      title: 'ALMOÇO LIBERADO ✓',
      detail: `${student.name} — ${student.grade} ${student.turma}`,
      sub: `Matrícula: ${student.registration} • Registrado às ${this.formatTimeString(nowIso)} (${method})`
    });

    await this.updateTodayCounterUI();
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
    if (!counterEl) return;

    const mode = this.getScannerMode();
    if (mode === 'portaria') {
      const count = await this.getTodayEntriesCount();
      counterEl.textContent = count;
    } else {
      const count = await this.getTodayMealsCount();
      counterEl.textContent = count;
    }
  }
}

const mealValidatorService = new MealValidatorService();
window.mealValidatorService = mealValidatorService;
