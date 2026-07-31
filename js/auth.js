/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Authentication & Roles Module
   ========================================================================== */

const ROLES = {
  OPERATOR: 'OPERATOR', // Cozinha / Refeitório
  ADMIN: 'ADMIN'       // Diretoria / Secretaria
};

class AuthManager {
  constructor() {
    this.currentRole = localStorage.getItem('sd_user_role') || ROLES.OPERATOR;
  }

  getCurrentRole() {
    return this.currentRole;
  }

  isAdmin() {
    return this.currentRole === ROLES.ADMIN;
  }

  isOperator() {
    return this.currentRole === ROLES.OPERATOR;
  }

  /**
   * Toggles role between OPERATOR and ADMIN.
   */
  toggleRole() {
    this.currentRole = (this.currentRole === ROLES.OPERATOR) ? ROLES.ADMIN : ROLES.OPERATOR;
    localStorage.setItem('sd_user_role', this.currentRole);
    this.applyRolePermissions();
    return this.currentRole;
  }

  /**
   * Updates UI components and tab visibility based on the active role.
   */
  applyRolePermissions() {
    const roleLabel = document.getElementById('user-role-label');
    const tabStudents = document.getElementById('tab-btn-students');
    const tabDashboard = document.getElementById('tab-btn-dashboard');

    if (roleLabel) {
      roleLabel.textContent = this.isAdmin() ? 'Diretoria / Admin' : 'Operador (Cozinha)';
    }

    // Role-based visibility
    if (tabStudents && tabDashboard) {
      if (this.isAdmin()) {
        tabStudents.style.display = 'inline-flex';
        tabDashboard.style.display = 'inline-flex';
      } else {
        // Operators only focus on the scanner tab
        tabStudents.style.display = 'none';
        tabDashboard.style.display = 'none';
        
        // Force switch to scanner tab if operator is currently on restricted tab
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.getAttribute('data-tab') !== 'tab-scanner') {
          const scannerTab = document.querySelector('[data-tab="tab-scanner"]');
          if (scannerTab) scannerTab.click();
        }
      }
    }
  }
}

const authManager = new AuthManager();
window.authManager = authManager;
