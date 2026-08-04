/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Main Application Entry & Event Controller
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
    btnToggleRole.addEventListener('click', () => {
      const newRole = window.authManager.toggleRole();
      alert(`Perfil alterado para: ${newRole === 'ADMIN' ? 'Diretoria / Admin' : 'Operador (Cozinha)'}`);
    });
  }

  // Scanner Buttons: Start / Stop Camera
  const btnStartCamera = document.getElementById('btn-start-camera');
  const btnStopCamera = document.getElementById('btn-stop-camera');
  if (btnStartCamera) {
    btnStartCamera.addEventListener('click', () => window.qrScannerController.startCamera());
  }
  if (btnStopCamera) {
    btnStopCamera.addEventListener('click', () => window.qrScannerController.stopCamera());
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
  if (searchInput) searchInput.addEventListener('input', () => renderStudentsTable());
  if (gradeFilter) gradeFilter.addEventListener('change', () => renderStudentsTable());

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

      try {
        await window.studentService.saveStudent({ id, name, registration, grade, turma });
        alert('Aluno salvo com sucesso!');
        closeStudentModal();
        renderStudentsTable();
      } catch (err) {
        alert(err.message || 'Erro ao salvar aluno.');
      }
    });
  }

  // Reissue QR Code Button (RN-002)
  const btnReissueQr = document.getElementById('btn-reissue-qr');
  if (btnReissueQr) {
    btnReissueQr.addEventListener('click', async () => {
      const studentId = document.getElementById('student-id').value;
      if (!studentId) return;

      if (confirm('Atenção: O QR Code antigo será REVOGADO imediatamente e não poderá mais ser usado no refeitório. Deseja gerar um novo QR Code?')) {
        try {
          const newToken = await window.studentService.reissueQrCode(studentId);
          alert('Novo QR Code gerado com sucesso! O código antigo foi revogado.');
          
          const student = await window.dbEngine.get('students', studentId);
          showQrCodeInModal(student);
          renderStudentsTable();
        } catch (err) {
          alert('Erro ao reemitir QR Code: ' + err.message);
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

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const jsonData = JSON.parse(event.target.result);
          await window.dbEngine.importDatabaseJson(jsonData);
          alert('Backup do banco de dados restaurado com sucesso!');
          renderStudentsTable();
          refreshDashboardView();
        } catch (err) {
          alert('Erro ao importar backup: ' + err.message);
        }
      };
      reader.readAsText(file);
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
// GLOBAL UI RENDER FUNCTIONS
// ------------------------------------------------------------------------

async function refreshAllUI() {
  if (window.mealValidatorService) {
    await window.mealValidatorService.updateTodayCounterUI();
  }
}

async function renderStudentsTable() {
  const tbody = document.getElementById('students-table-body');
  if (!tbody) return;

  const query = document.getElementById('search-student')?.value || '';
  const grade = document.getElementById('filter-grade')?.value || '';

  const students = await window.studentService.filterStudents(query, grade);

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
        <button class="btn ${s.active ? 'btn-danger' : 'btn-success'} btn-sm" onclick="toggleStudentStatus('${s.id}')">
          ${s.active ? '🚫 Desativar' : '✅ Ativar'}
        </button>
      </td>
    </tr>
  `).join('');
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
  if (confirm('Deseja alterar o status (Ativo/Inativo) deste aluno?')) {
    await window.studentService.toggleActive(id);
    renderStudentsTable();
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

// Make modal helper functions globally accessible for inline onclick handlers
window.openEditStudentModal = openEditStudentModal;
window.toggleStudentStatus = toggleStudentStatus;
