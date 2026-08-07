/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Main Application Entry & Event Controller (Custom System Dialogs)
   ========================================================================== */

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

  // 3. Apply Initial Role Permissions (OPERATOR / ADMIN)
  if (window.authManager) {
    window.authManager.applyRolePermissions();
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
      if (targetId === 'tab-dashboard') refreshDashboardView();
    });
  });

  // Toggle Role Button
  const btnToggleRole = document.getElementById('btn-toggle-role');
  if (btnToggleRole) {
    btnToggleRole.addEventListener('click', async () => {
      const newRole = window.authManager.toggleRole();
      const roleText = newRole === 'ADMIN' ? 'Diretoria / Admin' : 'Operador (Cozinha)';
      await showAlertModal({
        title: 'Perfil Alterado',
        message: `O perfil de acesso do sistema foi alterado para: ${roleText}.`,
        type: 'info',
        icon: '🔄'
      });
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

  // Student Search & Filter Events
  const searchInput = document.getElementById('search-student');
  const gradeFilter = document.getElementById('filter-grade');
  const turmaFilter = document.getElementById('filter-turma');
  if (searchInput) searchInput.addEventListener('input', () => renderStudentsTable());
  if (gradeFilter) gradeFilter.addEventListener('change', () => renderStudentsTable());
  if (turmaFilter) turmaFilter.addEventListener('change', () => renderStudentsTable());

  // Modal Open / Close Controls
  const modalStudent = document.getElementById('modal-student');
  const btnOpenAdd = document.getElementById('btn-open-add-student');
  const btnCloseModal = document.getElementById('btn-close-student-modal');
  const btnCancelStudent = document.getElementById('btn-cancel-student');

  if (btnOpenAdd) btnOpenAdd.addEventListener('click', () => openStudentModal());
  if (btnCloseModal) btnCloseModal.addEventListener('click', () => closeStudentModal());
  if (btnCancelStudent) btnCancelStudent.addEventListener('click', () => closeStudentModal());

  // Student Form Submission (Create / Edit)
  const formStudent = document.getElementById('form-student');
  if (formStudent) {
    formStudent.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('student-id').value;
      const name = document.getElementById('student-name').value;
      const registration = document.getElementById('student-registration').value;
      const grade = document.getElementById('student-grade').value;
      const turma = document.getElementById('student-turma').value;

      showLoadingModal('Salvando cadastro no banco de dados e sincronizando com a nuvem...', 'Salvando Aluno');
      try {
        await window.studentService.saveStudent({ id, name, registration, grade, turma });
        hideLoadingModal();
        closeStudentModal();
        renderStudentsTable();
        await showAlertModal({
          title: 'Aluno Salvo',
          message: `O cadastro do aluno "${name}" foi salvo com sucesso!`,
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

  // Report Date & Status Filters
  const reportDateInput = document.getElementById('report-date');
  const reportStatusFilter = document.getElementById('report-filter-status');
  const btnExportCsv = document.getElementById('btn-export-csv');

  if (reportDateInput) {
    reportDateInput.value = window.mealValidatorService.getTodayDateString();
    reportDateInput.addEventListener('change', () => refreshDashboardView());
  }
  if (reportStatusFilter) {
    reportStatusFilter.addEventListener('change', () => refreshDashboardView());
  }
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      const dateVal = reportDateInput ? reportDateInput.value : '';
      window.dashboardController.exportReportCsv(dateVal);
    });
  }
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
    await window.mealValidatorService.updateTodayCounterUI();
  }
  renderStudentsTable();
}

async function updateTurmaFilterOptions(allStudents) {
  const turmaSelect = document.getElementById('filter-turma');
  if (!turmaSelect) return;

  const currentVal = turmaSelect.value;
  const uniqueTurmas = Array.from(new Set(allStudents.map(s => s.turma).filter(Boolean))).sort();

  turmaSelect.innerHTML = '<option value="">Todas as Turmas</option>' + 
    uniqueTurmas.map(t => `<option value="${t}">${t}</option>`).join('');

  if (uniqueTurmas.includes(currentVal)) {
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
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          Nenhum aluno encontrado para a busca.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = students.map(s => `
    <tr>
      <td><strong>${s.registration}</strong></td>
      <td>${s.name}</td>
      <td>${s.grade} — ${s.turma}</td>
      <td>
        ${s.active 
          ? '<span class="badge badge-success">ATIVO</span>' 
          : '<span class="badge badge-danger">INATIVO</span>'}
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openEditStudentModal('${s.id}')">✏️ Editar / QR</button>
        <button class="btn ${s.active ? 'btn-warning' : 'btn-success'} btn-sm" onclick="toggleStudentStatus('${s.id}')">
          ${s.active ? '🚫 Desativar' : '✅ Ativar'}
        </button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteStudent('${s.id}', '${s.name}')" title="Excluir aluno permanentemente">🗑️ Excluir</button>
      </td>
    </tr>
  `).join('');
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
  document.getElementById('student-turma').value = student.turma;

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

async function refreshDashboardView() {
  if (window.dashboardController) {
    await window.dashboardController.refreshTodayMetrics();
    const dateVal = document.getElementById('report-date')?.value;
    const statusVal = document.getElementById('report-filter-status')?.value;
    await window.dashboardController.loadReportTable(dateVal, statusVal);
  }
}

// Make modal helper functions globally accessible
window.openEditStudentModal = openEditStudentModal;
window.toggleStudentStatus = toggleStudentStatus;
window.confirmDeleteStudent = confirmDeleteStudent;
window.showConfirmModal = showConfirmModal;
window.showAlertModal = showAlertModal;
window.showLoadingModal = showLoadingModal;
window.hideLoadingModal = hideLoadingModal;
