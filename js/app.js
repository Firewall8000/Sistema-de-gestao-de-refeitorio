/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Main Application Entry & Event Controller (Custom System Dialogs)
   ========================================================================== */

const turmasPorSerie = {
  '9º Ano': ['Turma A', 'Turma B'],
  '1º Ano': ['Turma A', 'Turma B', 'Turma C'],
  '2º Ano': ['Turma A', 'Turma B', 'Turma C', 'Turma D'],
  '3º Ano': ['Turma A', 'Turma B', 'Turma C', 'Turma D', 'Turma E']
};

/**
 * HTML Entity Escape helper against XSS
 */
function _esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window._esc = _esc;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Inicializando Sistema Santos Dumont...');

  // 1. Initialize IndexedDB Database & Seed Data
  try {
    await window.dbEngine.init();
    await window.dbEngine.seedInitialData();
  } catch (err) {
    console.error('❌ Falha ao inicializar banco de dados:', err);
  }

  // 2. Initialize Network Sync Engine & Service Worker
  if (window.syncEngine) {
    window.syncEngine.init();
  }

  // 3. Apply Initial Role Permissions (Always start at restricted profile: Leitura / Refeitório)
  if (window.authManager) {
    window.authManager.setRole('OPERATOR');
  }

  // 4. Initial Render of Counters & Students Table
  refreshAllUI();

  // ------------------------------------------------------------------------
  // EVENT LISTENERS & UI BINDINGS
  // ------------------------------------------------------------------------

  // Navigation Tab Switches
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');

      // Refresh tab specific data
      if (targetId === 'tab-students') renderStudentsTable();
      if (targetId === 'tab-tv') refreshTvView();
      if (targetId === 'tab-dashboard') refreshDashboardView();
    });
  });

  // Toggle Role Button (Admin Password Protection)
  const btnToggleRole = document.getElementById('btn-toggle-role');
  if (btnToggleRole) {
    btnToggleRole.addEventListener('click', () => {
      if (window.authManager && window.authManager.isAdmin()) {
        // Sair do Admin: retorne imediatamente ao perfil restrito do refeitório
        window.authManager.setRole('OPERATOR');
      } else {
        // Está no refeitório: exiba o modal solicitando a senha
        openAdminAuthModal();
      }
    });
  }

  // Admin Auth Modal Events & Password Validation
  const formAdminAuth = document.getElementById('form-admin-auth');
  const btnCancelAdminAuth = document.getElementById('btn-cancel-admin-auth');
  const btnCloseAdminAuthModal = document.getElementById('btn-close-admin-auth-modal');

  if (btnCancelAdminAuth) {
    btnCancelAdminAuth.addEventListener('click', () => closeAdminAuthModal());
  }
  if (btnCloseAdminAuthModal) {
    btnCloseAdminAuthModal.addEventListener('click', () => closeAdminAuthModal());
  }

  if (formAdminAuth) {
    formAdminAuth.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inputPassword = document.getElementById('input-admin-password');
      const errorMsg = document.getElementById('admin-auth-error');
      const passwordVal = inputPassword ? inputPassword.value : '';

      const adminEmail = 'danielsandes05@gmail.com';

      showLoadingModal('Autenticando com o servidor seguro...', 'Acesso Admin');

      const { data, error } = await window.supabaseClient.auth.signInWithPassword({
        email: adminEmail,
        password: passwordVal
      });

      hideLoadingModal();

      if (error || !data.session) {
        if (errorMsg) {
          errorMsg.textContent = 'Senha incorreta ou acesso não autorizado.';
          errorMsg.style.display = 'block';
        }
        if (inputPassword) {
          inputPassword.value = '';
          inputPassword.focus();
        }
        return;
      }

      // Sucesso: Ativa perfil ADMIN e fecha modal
      if (window.authManager) {
        window.authManager.setRole('ADMIN');
      }
      closeAdminAuthModal();
      await refreshAllUI();
    });
  }

  // Scanner Buttons: Start / Stop Camera & Image Upload
  const btnStartCamera = document.getElementById('btn-start-camera');
  const btnStopCamera = document.getElementById('btn-stop-camera');
  const inputQrFile = document.getElementById('input-qr-file');

  if (btnStartCamera) {
    btnStartCamera.addEventListener('click', () => window.qrScannerController.startCamera());
  }
  if (btnStopCamera) {
    btnStopCamera.addEventListener('click', () => window.qrScannerController.stopCamera());
  }
  if (inputQrFile) {
    inputQrFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await window.qrScannerController.scanImageFile(file);
        inputQrFile.value = '';
      }
    });
  }

  // Manual Entry Form (Matrícula)
  const formManualEntry = document.getElementById('form-manual-entry');
  if (formManualEntry) {
    formManualEntry.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('input-manual-registration');
      if (input && input.value.trim()) {
        await window.mealValidatorService.validateAndRecordMeal({ registration: input.value.trim() });
        input.value = '';
      }
    });
  }

  // Scanner Mode Pill Toggle Buttons (Portaria x Refeitório)
  const pillRefeitorio = document.getElementById('mode-pill-refeitorio');
  const pillPortaria = document.getElementById('mode-pill-portaria');

  if (pillRefeitorio) {
    pillRefeitorio.addEventListener('click', () => {
      if (window.mealValidatorService) {
        window.mealValidatorService.setScannerMode('refeitorio');
      }
    });
  }

  if (pillPortaria) {
    pillPortaria.addEventListener('click', () => {
      if (window.mealValidatorService) {
        window.mealValidatorService.setScannerMode('portaria');
      }
    });
  }

  // Student Search & Filter Events
  const searchInput = document.getElementById('search-student');
  const gradeFilter = document.getElementById('filter-grade');
  const turmaFilter = document.getElementById('filter-turma');
  if (searchInput) searchInput.addEventListener('input', () => renderStudentsTable());
  if (gradeFilter) gradeFilter.addEventListener('change', () => renderStudentsTable());
  if (turmaFilter) turmaFilter.addEventListener('change', () => renderStudentsTable());
  initBadgeBatchPrint();

  // Modal Open / Close Controls
  const modalStudent = document.getElementById('modal-student');
  const btnOpenAdd = document.getElementById('btn-open-add-student');
  const btnCloseModal = document.getElementById('btn-close-student-modal');
  const btnCancelStudent = document.getElementById('btn-cancel-student');
  const modalStudentGrade = document.getElementById('student-grade');

  if (btnOpenAdd) btnOpenAdd.addEventListener('click', () => openStudentModal());
  if (btnCloseModal) btnCloseModal.addEventListener('click', () => closeStudentModal());
  if (btnCancelStudent) btnCancelStudent.addEventListener('click', () => closeStudentModal());
  if (modalStudentGrade) {
    modalStudentGrade.addEventListener('change', function() {
      updateModalTurmaOptions(this.value);
    });
  }

  // Student Form Submission (Create / Edit)
  const formStudent = document.getElementById('form-student');
  if (formStudent) {
    formStudent.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('student-id').value;
      const rawName = document.getElementById('student-name').value;
      const rawRegistration = document.getElementById('student-registration').value;
      const grade = document.getElementById('student-grade').value;
      const turma = document.getElementById('student-turma').value;

      const cleanName = (rawName || '').trim();
      const cleanRegistration = (rawRegistration || '').trim();

      // Validação estrita: apenas caracteres alfanuméricos e espaços válidos
      const validTextRegex = /^[a-zA-Z0-9\u00C0-\u017F\s]+$/;

      if (!cleanName || !validTextRegex.test(cleanName)) {
        await showAlertModal({
          title: 'Nome Inválido',
          message: 'O campo Nome Completo deve conter apenas caracteres alfanuméricos e espaços válidos.',
          type: 'danger'
        });
        return;
      }

      if (!cleanRegistration || !validTextRegex.test(cleanRegistration)) {
        await showAlertModal({
          title: 'Matrícula Inválida',
          message: 'O campo Matrícula deve conter apenas caracteres alfanuméricos e espaços válidos.',
          type: 'danger'
        });
        return;
      }

      showLoadingModal('Salvando cadastro no banco de dados e sincronizando com a nuvem...', 'Salvando Aluno');
      try {
        await window.studentService.saveStudent({ id, name: cleanName, registration: cleanRegistration, grade, turma });
        hideLoadingModal();
        closeStudentModal();
        renderStudentsTable();
        await showAlertModal({
          title: 'Aluno Salvo',
          message: `O cadastro do aluno "${cleanName}" foi salvo com sucesso!`,
          type: 'success'
        });
      } catch (err) {
        hideLoadingModal();
        await showAlertModal({
          title: 'Erro ao Salvar',
          message: err.message || 'Ocorreu um erro ao salvar o aluno.',
          type: 'danger'
        });
      }
    });
  }

  // Reissue QR Code Button (RN-002)
  const btnReissueQr = document.getElementById('btn-reissue-qr');
  if (btnReissueQr) {
    btnReissueQr.addEventListener('click', async () => {
      const studentId = document.getElementById('student-id').value;
      if (!studentId) return;

      const confirmReissue = await showConfirmModal({
        title: 'Revogar & Gerar Novo QR Code',
        message: 'Atenção: O QR Code antigo será REVOGADO imediatamente e não poderá mais ser usado no refeitório. Deseja gerar um novo QR Code?',
        icon: '🔄',
        confirmText: 'Sim, Revogar e Gerar Novo',
        cancelText: 'Cancelar',
        isDanger: true
      });

      if (confirmReissue) {
        showLoadingModal('Gerando novo token e atualizando na nuvem...', 'Revogando QR Code');
        try {
          const newToken = await window.studentService.reissueQrCode(studentId);
          hideLoadingModal();
          const student = await window.dbEngine.get('students', studentId);
          showQrCodeInModal(student);
          renderStudentsTable();
          await showAlertModal({
            title: 'QR Code Revogado',
            message: 'Novo QR Code gerado com sucesso! O código antigo foi revogado.',
            type: 'success'
          });
        } catch (err) {
          hideLoadingModal();
          await showAlertModal({
            title: 'Erro na Revogação',
            message: 'Erro ao reemitir QR Code: ' + err.message,
            type: 'danger'
          });
        }
      }
    });
  }

  // Print Badge Button
  const btnPrintBadge = document.getElementById('btn-print-badge');
  if (btnPrintBadge) {
    btnPrintBadge.addEventListener('click', async () => {
      const studentId = document.getElementById('student-id').value;
      if (studentId) {
        const student = await window.dbEngine.get('students', studentId);
        if (student) window.qrBadgeGenerator.printBadge(student);
      }
    });
  }

  // Database Backup Export & Restore Events
  const btnExportDb = document.getElementById('btn-export-db');
  const inputImportDb = document.getElementById('input-import-db');

  if (btnExportDb) {
    btnExportDb.addEventListener('click', async () => {
      await window.dbEngine.exportDatabaseJson();
    });
  }

  if (inputImportDb) {
    inputImportDb.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const confirmImport = await showConfirmModal({
        title: 'Restaurar Backup do Banco',
        message: 'Deseja importar e mesclar todos os dados do arquivo de backup (.JSON) selecionado?',
        icon: '📂',
        confirmText: 'Sim, Restaurar Backup',
        cancelText: 'Cancelar'
      });

      if (confirmImport) {
        showLoadingModal('Importando dados e restaurando tabelas...', 'Restaurando Backup');
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const jsonData = JSON.parse(event.target.result);
            await window.dbEngine.importDatabaseJson(jsonData);
            hideLoadingModal();
            renderStudentsTable();
            refreshDashboardView();
            await showAlertModal({
              title: 'Backup Restaurado',
              message: 'Todos os alunos e registros de refeições foram restaurados com sucesso!',
              type: 'success'
            });
          } catch (err) {
            hideLoadingModal();
            await showAlertModal({
              title: 'Erro na Restauração',
              message: 'Erro ao importar arquivo de backup: ' + err.message,
              type: 'danger'
            });
          }
        };
        reader.readAsText(file);
      }
    });
  }

  // Report Status Filter & Audit Search
  const reportStatusFilter = document.getElementById('report-filter-status');
  const auditSearch = document.getElementById('audit-search');
  const btnExportReport = document.getElementById('btn-export-report');

  if (reportStatusFilter) {
    reportStatusFilter.addEventListener('change', () => refreshDashboardView());
  }
  if (auditSearch) {
    auditSearch.addEventListener('input', () => refreshDashboardView());
  }
  if (btnExportReport) {
    btnExportReport.addEventListener('click', () => {
      window.dashboardController.exportWordReport();
    });
  }

  // Dashboard Period Selector Buttons
  document.querySelectorAll('.dash-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const period = btn.getAttribute('data-period');
      if (window.dashboardController) {
        window.dashboardController.setCurrentPeriod(period);
      }
    });
  });
});

// ------------------------------------------------------------------------
// CUSTOM SYSTEM DIALOG HELPERS (MODALS & TOASTS)
// ------------------------------------------------------------------------

function showConfirmModal({ title = 'Confirmação', message = '', icon = '⚠️', confirmText = 'Confirmar', cancelText = 'Cancelar', isDanger = false }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-confirm');
    const titleEl = document.getElementById('sys-confirm-title');
    const msgEl = document.getElementById('sys-confirm-message');
    const iconEl = document.getElementById('sys-confirm-icon');
    const btnOk = document.getElementById('btn-sys-confirm-ok');
    const btnCancel = document.getElementById('btn-sys-confirm-cancel');

    if (!modal) return resolve(false);

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (iconEl) iconEl.textContent = icon;
    if (btnOk) {
      btnOk.textContent = confirmText;
      btnOk.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';
    }
    if (btnCancel) btnCancel.textContent = cancelText;

    const cleanup = () => {
      modal.classList.remove('active');
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
    };

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);

    modal.classList.add('active');
  });
}

function showAlertModal({ title = 'Aviso', message = '', type = 'info', icon = null }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-alert');
    const titleEl = document.getElementById('sys-alert-title');
    const msgEl = document.getElementById('sys-alert-message');
    const iconEl = document.getElementById('sys-alert-icon');
    const btnOk = document.getElementById('btn-sys-alert-ok');

    if (!modal) return resolve();

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    
    if (iconEl) {
      if (icon) iconEl.textContent = icon;
      else if (type === 'success') iconEl.textContent = '✅';
      else if (type === 'danger' || type === 'error') iconEl.textContent = '❌';
      else if (type === 'warning') iconEl.textContent = '⚠️';
      else iconEl.textContent = 'ℹ️';
    }

    const onOk = () => {
      modal.classList.remove('active');
      btnOk.removeEventListener('click', onOk);
      resolve();
    };

    btnOk.addEventListener('click', onOk);
    modal.classList.add('active');
  });
}

function showLoadingModal(message = 'Conectando com o servidor...', title = 'Processando...') {
  const modal = document.getElementById('modal-loading');
  const titleEl = document.getElementById('sys-loading-title');
  const msgEl = document.getElementById('sys-loading-message');

  if (modal) {
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    modal.classList.add('active');
  }
}

function hideLoadingModal() {
  const modal = document.getElementById('modal-loading');
  if (modal) modal.classList.remove('active');
}

// ------------------------------------------------------------------------
// GLOBAL UI RENDER FUNCTIONS
// ------------------------------------------------------------------------

async function refreshAllUI() {
  if (window.mealValidatorService) {
    const currentMode = window.mealValidatorService.getScannerMode();
    window.mealValidatorService.updateScannerUIForMode(currentMode);
  }
  renderStudentsTable();
}

function updateModalTurmaOptions(selectedGrade, currentTurma = '') {
  const turmaSelect = document.getElementById('student-turma');
  if (!turmaSelect) return;

  const turmas = turmasPorSerie[selectedGrade] || ['Turma A', 'Turma B'];
  turmaSelect.innerHTML = turmas.map(t => `<option value="${t}">${t}</option>`).join('');

  if (currentTurma && turmas.includes(currentTurma)) {
    turmaSelect.value = currentTurma;
  } else {
    turmaSelect.value = turmas[0];
  }
}

async function updateTurmaFilterOptions(allStudents) {
  const turmaSelect = document.getElementById('filter-turma');
  if (!turmaSelect) return;

  const currentVal = turmaSelect.value;
  const selectedGrade = document.getElementById('filter-grade')?.value;

  let turmasList;
  if (selectedGrade && turmasPorSerie[selectedGrade]) {
    turmasList = turmasPorSerie[selectedGrade];
  } else {
    const turmasFromConfig = Object.values(turmasPorSerie).flat();
    const turmasFromStudents = allStudents ? allStudents.map(s => s.turma).filter(Boolean) : [];
    turmasList = Array.from(new Set([...turmasFromConfig, ...turmasFromStudents])).sort();
  }

  turmaSelect.innerHTML = '<option value="">Todas as Turmas</option>' + 
    turmasList.map(t => `<option value="${t}">${t}</option>`).join('');

  if (turmasList.includes(currentVal)) {
    turmaSelect.value = currentVal;
  }
}

async function renderStudentsTable() {
  const tbody = document.getElementById('students-table-body');
  if (!tbody) return;

  const query = document.getElementById('search-student')?.value || '';
  const grade = document.getElementById('filter-grade')?.value || '';
  const turma = document.getElementById('filter-turma')?.value || '';

  const allStudents = await window.studentService.getAllStudents();
  updateTurmaFilterOptions(allStudents);

  const students = await window.studentService.filterStudents(query, grade, turma);

  if (students.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          Nenhum aluno encontrado para a busca.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = students.map(s => `
    <tr>
      <td><input type="checkbox" class="badge-select" data-id="${_esc(s.id)}" ${selectedBadgeIds.has(s.id) ? 'checked' : ''}></td>
      <td><strong>${_esc(s.registration)}</strong></td>
      <td>${_esc(s.name)}</td>
      <td>${_esc(s.grade)} — ${_esc(s.turma)}</td>
      <td>
        ${!s.active 
          ? '<span class="badge badge-danger">INATIVO</span>' 
          : (s.boundDeviceId 
            ? '<span class="badge badge-success">ATIVO • CADASTRADO</span>' 
            : '<span class="badge badge-info">ATIVO</span>')
        }
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openEditStudentModal('${_esc(s.id)}')">✏️ Editar / QR</button>
        <button class="btn btn-secondary btn-sm" onclick="confirmResetStudentDevice('${_esc(s.id)}', '${_esc(s.name).replace(/'/g, "\\'")}')" title="Desvincular celular atual e permitir cadastro em novo aparelho">
          📱 Liberar Celular
        </button>
        <button class="btn ${s.active ? 'btn-warning' : 'btn-success'} btn-sm" onclick="toggleStudentStatus('${_esc(s.id)}')">
          ${s.active ? '🚫 Desativar' : '✅ Ativar'}
        </button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteStudent('${_esc(s.id)}', '${_esc(s.name).replace(/'/g, "\\'")}')" title="Excluir aluno permanentemente">🗑️ Excluir</button>
      </td>
    </tr>
  `).join('');

  currentListedIds = students.map(s => s.id);
  updateBadgeSelectionUI();
}

// ---- Seleção de crachás para impressão em lote (A4) ----
const selectedBadgeIds = new Set();
let currentListedIds = [];

function updateBadgeSelectionUI() {
  const n = selectedBadgeIds.size;
  const btn = document.getElementById('btn-print-selected-badges');
  const count = document.getElementById('selected-badges-count');
  const clear = document.getElementById('btn-clear-selected-badges');
  const all = document.getElementById('select-all-badges');
  if (btn) btn.disabled = n === 0;
  if (clear) clear.style.display = n > 0 ? 'inline-flex' : 'none';
  if (count) {
    const folhas = Math.ceil(n / 4);
    count.textContent = n === 0
      ? 'Nenhum aluno selecionado'
      : `${n} selecionado(s) • ${folhas} folha(s) A4`;
  }
  if (all) {
    const listed = currentListedIds.length;
    const marked = currentListedIds.filter(id => selectedBadgeIds.has(id)).length;
    all.checked = listed > 0 && marked === listed;
    all.indeterminate = marked > 0 && marked < listed;
  }
}

function initBadgeBatchPrint() {
  const tbody = document.getElementById('students-table-body');
  const all = document.getElementById('select-all-badges');
  const btn = document.getElementById('btn-print-selected-badges');
  const clear = document.getElementById('btn-clear-selected-badges');
  if (!tbody || !btn) return;

  tbody.addEventListener('change', (e) => {
    const cb = e.target.closest('.badge-select');
    if (!cb) return;
    if (cb.checked) selectedBadgeIds.add(cb.dataset.id); else selectedBadgeIds.delete(cb.dataset.id);
    updateBadgeSelectionUI();
  });

  if (all) all.addEventListener('change', () => {
    currentListedIds.forEach(id => { if (all.checked) selectedBadgeIds.add(id); else selectedBadgeIds.delete(id); });
    tbody.querySelectorAll('.badge-select').forEach(cb => { cb.checked = all.checked; });
    updateBadgeSelectionUI();
  });

  if (clear) clear.addEventListener('click', () => {
    selectedBadgeIds.clear();
    tbody.querySelectorAll('.badge-select').forEach(cb => { cb.checked = false; });
    updateBadgeSelectionUI();
  });

  btn.addEventListener('click', async () => {
    const students = [];
    for (const id of selectedBadgeIds) {
      const st = await window.dbEngine.get('students', id);
      if (st) students.push(st);
    }
    students.sort((a, b) =>
      String(a.grade).localeCompare(String(b.grade), 'pt-BR') ||
      String(a.turma).localeCompare(String(b.turma), 'pt-BR') ||
      String(a.name).localeCompare(String(b.name), 'pt-BR'));

    const printable = students.filter(st => st.qrToken);
    const skipped = students.length - printable.length;
    if (printable.length === 0) {
      await showAlertModal({ title: 'Nada para imprimir', message: 'Os alunos selecionados não possuem QR Code disponível neste dispositivo.', type: 'danger' });
      return;
    }
    const result = window.qrBadgeGenerator.printBadges(printable);
    if (result === null) {
      await showAlertModal({ title: 'Pop-up bloqueado', message: 'Permita pop-ups para este site e clique em imprimir novamente.', type: 'danger' });
      return;
    }
    if (skipped > 0) {
      await showAlertModal({ title: 'Alguns alunos ficaram de fora', message: `${skipped} aluno(s) selecionado(s) não têm QR Code disponível neste dispositivo e não foram incluídos.`, type: 'info' });
    }
  });
}

async function confirmResetStudentDevice(id, name) {
  const confirmed = await showConfirmModal({
    title: 'Liberar Novo Celular',
    message: `Deseja desvincular o aparelho atual do aluno "${name}"?\n\nO celular antigo perderá o acesso e a carteirinha ficará livre para ser cadastrada no novo telefone.`,
    icon: '🔓',
    confirmText: 'Sim, Liberar Celular',
    cancelText: 'Cancelar'
  });

  if (confirmed) {
    showLoadingModal('Desvinculando aparelho no servidor...', 'Liberando Acesso');
    try {
      await window.studentService.resetStudentDevice(id);
      hideLoadingModal();
      renderStudentsTable();
      await showAlertModal({
        title: 'Aparelho Liberado',
        message: 'Aparelho desvinculado com sucesso! O aluno pode agora fazer o login em seu novo celular.',
        type: 'success'
      });
    } catch (err) {
      hideLoadingModal();
      await showAlertModal({
        title: 'Erro ao Liberar Celular',
        message: err.message || 'Erro ao desvincular aparelho.',
        type: 'danger'
      });
    }
  }
}

async function confirmDeleteStudent(id, name) {
  const confirmed = await showConfirmModal({
    title: 'Excluir Aluno Permanentemente',
    message: `⚠️ ATENÇÃO: Tem certeza que deseja EXCLUIR PERMANENTEMENTE o cadastro do aluno "${name}"?\nEsta ação removerá o aluno da nuvem e não poderá ser desfeita.`,
    icon: '🗑️',
    confirmText: 'Sim, Excluir Aluno',
    cancelText: 'Cancelar',
    isDanger: true
  });

  if (confirmed) {
    showLoadingModal('Removendo aluno do servidor e do banco de dados...', 'Excluindo Aluno');
    try {
      await window.studentService.deleteStudent(id);
      hideLoadingModal();
      renderStudentsTable();
      refreshDashboardView();
      await showAlertModal({
        title: 'Aluno Excluído',
        message: `O cadastro do aluno "${name}" foi excluído permanentemente.`,
        type: 'success'
      });
    } catch (err) {
      hideLoadingModal();
      await showAlertModal({
        title: 'Erro ao Excluir',
        message: 'Erro ao excluir aluno: ' + err.message,
        type: 'danger'
      });
    }
  }
}

async function openStudentModal() {
  document.getElementById('modal-student-title').textContent = 'Cadastrar Novo Aluno';
  document.getElementById('form-student').reset();
  document.getElementById('student-id').value = '';
  document.getElementById('student-registration').readOnly = false;
  document.getElementById('qr-preview-area').style.display = 'none';

  const gradeSelect = document.getElementById('student-grade');
  if (gradeSelect) {
    updateModalTurmaOptions(gradeSelect.value);
  }

  const modal = document.getElementById('modal-student');
  if (modal) modal.classList.add('active');
}

async function openEditStudentModal(id) {
  const student = await window.dbEngine.get('students', id);
  if (!student) return;

  document.getElementById('modal-student-title').textContent = 'Editar Aluno & Gerar Ficha';
  document.getElementById('student-id').value = student.id;
  document.getElementById('student-name').value = student.name;
  document.getElementById('student-registration').value = student.registration;
  document.getElementById('student-registration').readOnly = true;
  document.getElementById('student-grade').value = student.grade;

  updateModalTurmaOptions(student.grade, student.turma);

  showQrCodeInModal(student);

  const modal = document.getElementById('modal-student');
  if (modal) modal.classList.add('active');
}

function showQrCodeInModal(student) {
  const qrArea = document.getElementById('qr-preview-area');
  const qrBox = document.getElementById('qr-code-box');

  if (qrArea && qrBox) {
    qrArea.style.display = 'block';
    qrBox.innerHTML = window.qrBadgeGenerator.generateQrSvg(student.qrToken, 160);
  }
}

function closeStudentModal() {
  const modal = document.getElementById('modal-student');
  if (modal) modal.classList.remove('active');
}

async function toggleStudentStatus(id) {
  const confirmToggle = await showConfirmModal({
    title: 'Alterar Status do Aluno',
    message: 'Deseja alterar o status (Ativo/Inativo) deste aluno?',
    icon: '🔄',
    confirmText: 'Sim, Alterar Status',
    cancelText: 'Cancelar'
  });

  if (confirmToggle) {
    showLoadingModal('Atualizando status no servidor...', 'Processando');
    try {
      await window.studentService.toggleActive(id);
      hideLoadingModal();
      renderStudentsTable();
    } catch (err) {
      hideLoadingModal();
      await showAlertModal({ title: 'Erro', message: err.message, type: 'danger' });
    }
  }
}

async function refreshTvView() {
  if (window.dashboardController) {
    window.dashboardController.initRealtimeSubscription();
    window.dashboardController.startTvClock();
    await window.dashboardController.refreshTvFeed();
  }
}

async function refreshDashboardView() {
  if (window.dashboardController) {
    window.dashboardController.initRealtimeSubscription();
    await window.dashboardController.refreshDashboardForPeriod();
  }
}

function openAdminAuthModal() {
  const modal = document.getElementById('modal-admin-auth');
  const inputPassword = document.getElementById('input-admin-password');
  const errorMsg = document.getElementById('admin-auth-error');

  if (inputPassword) inputPassword.value = '';
  if (errorMsg) {
    errorMsg.textContent = '';
    errorMsg.style.display = 'none';
  }
  if (modal) {
    modal.classList.add('active');
    setTimeout(() => {
      if (inputPassword) inputPassword.focus();
    }, 100);
  }
}

function closeAdminAuthModal() {
  const modal = document.getElementById('modal-admin-auth');
  const inputPassword = document.getElementById('input-admin-password');
  const errorMsg = document.getElementById('admin-auth-error');

  if (inputPassword) inputPassword.value = '';
  if (errorMsg) {
    errorMsg.textContent = '';
    errorMsg.style.display = 'none';
  }
  if (modal) modal.classList.remove('active');
}

// Make modal helper functions globally accessible
window.openAdminAuthModal = openAdminAuthModal;
window.closeAdminAuthModal = closeAdminAuthModal;
window.openEditStudentModal = openEditStudentModal;
window.updateModalTurmaOptions = updateModalTurmaOptions;
window.confirmResetStudentDevice = confirmResetStudentDevice;
window.toggleStudentStatus = toggleStudentStatus;
window.confirmDeleteStudent = confirmDeleteStudent;
window.showConfirmModal = showConfirmModal;
window.showAlertModal = showAlertModal;
window.showLoadingModal = showLoadingModal;
window.hideLoadingModal = hideLoadingModal;
