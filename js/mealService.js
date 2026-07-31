/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Meal Validation & Daily Single-Meal Rule Engine (RN-001)
   ========================================================================== */

class MealValidatorService {

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
   * Formats ISO timestamp to local time string HH:MM:SS.
   */
  formatTimeString(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString('pt-BR');
  }

  /**
   * Checks if student already had lunch today.
   */
  async getTodayMealForStudent(studentRegistration) {
    const today = this.getTodayDateString();
    const allTodayMeals = await window.dbEngine.getAllByIndex('meal_logs', 'date', today);
    return allTodayMeals.find(m => m.studentRegistration === studentRegistration) || null;
  }

  /**
   * Counts total meals served today.
   */
  async getTodayMealsCount() {
    const today = this.getTodayDateString();
    const meals = await window.dbEngine.getAllByIndex('meal_logs', 'date', today);
    return meals.length;
  }

  /**
   * Primary entry point for validating and recording a meal attempt.
   * accepts { qrToken } or { registration }
   */
  async validateAndRecordMeal({ qrToken, registration }) {
    let student = null;
    let method = 'CAMERA';

    // 1. Locate student
    if (qrToken) {
      student = await window.studentService.getByQrToken(qrToken);
      method = 'CAMERA';
    } else if (registration) {
      student = await window.studentService.getByRegistration(registration);
      method = 'MANUAL';
    }

    // 2. Validate Student Existence
    if (!student) {
      this.displayValidationResult({
        success: false,
        title: 'CÓDIGO / MATRÍCULA INVÁLIDA',
        detail: 'Nenhum estudante foi encontrado com os dados apresentados.',
        sub: 'Verifique se o crachá pertence à escola ou solicite segunda via na Secretaria.'
      });
      return false;
    }

    // 3. Validate Student Active Status (RN-003)
    if (!student.active) {
      this.displayValidationResult({
        success: false,
        title: 'ALUNO INATIVO / BLOQUEADO',
        detail: `${student.name} — ${student.grade} (${student.turma})`,
        sub: 'Este aluno está marcado como inativo no sistema. Procure a secretaria.'
      });
      return false;
    }

    // 4. Validate Single-Meal Per Day Rule (RN-001)
    const existingMeal = await this.getTodayMealForStudent(student.registration);

    if (existingMeal) {
      const mealTime = this.formatTimeString(existingMeal.timestamp);
      this.displayValidationResult({
        success: false,
        title: 'ALMOÇO JÁ REGISTRADO HOJE!',
        detail: `${student.name} — ${student.grade} (${student.turma})`,
        sub: `Refeição já concedida hoje às ${mealTime}. Bloqueado segundo a RN-001.`
      });
      return false;
    }

    // 5. Success! Record Meal Log in IndexedDB
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

    await window.dbEngine.put('meal_logs', mealLog);

    // 6. Display Success Banner
    this.displayValidationResult({
      success: true,
      title: 'ALMOÇO LIBERADO ✓',
      detail: `${student.name} — ${student.grade} ${student.turma}`,
      sub: `Matrícula: ${student.registration} • Registrado às ${this.formatTimeString(nowIso)} (${method})`
    });

    // Update counters on UI
    this.updateTodayCounterUI();
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

    // Auto-scroll banner into view for refectory operator
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Updates today's meal counter badge in UI.
   */
  async updateTodayCounterUI() {
    const counterEl = document.getElementById('counter-today-meals');
    if (counterEl) {
      const count = await this.getTodayMealsCount();
      counterEl.textContent = count;
    }
  }
}

const mealValidatorService = new MealValidatorService();
window.mealValidatorService = mealValidatorService;
