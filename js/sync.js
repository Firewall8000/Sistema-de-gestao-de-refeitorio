/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Sync Engine & Network Status Detector
   ========================================================================== */

class NetworkSyncEngine {
  constructor() {
    this.isOnline = navigator.onLine;
  }

  init() {
    // Listen for online / offline network status changes
    window.addEventListener('online', () => this.handleNetworkChange(true));
    window.addEventListener('offline', () => this.handleNetworkChange(false));

    // Register Service Worker
    this.registerServiceWorker();

    // Initial check
    this.handleNetworkChange(navigator.onLine);
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => console.log('✅ Service Worker registrado com escopo:', reg.scope))
          .catch((err) => console.warn('⚠️ Falha ao registrar Service Worker:', err));
      });
    }
  }

  /**
   * Updates offline warning bar UI on network status transition.
   */
  handleNetworkChange(online) {
    this.isOnline = online;
    const offlineBar = document.getElementById('offline-bar');

    if (offlineBar) {
      if (online) {
        offlineBar.classList.add('hidden');
        this.syncPendingOfflineRecords();
      } else {
        offlineBar.classList.remove('hidden');
      }
    }
  }

  /**
   * Syncs locally stored offline meal records when connection returns.
   */
  async syncPendingOfflineRecords() {
    if (!window.dbEngine) return;

    try {
      const allMeals = await window.dbEngine.getAll('meal_logs');
      const pendingMeals = allMeals.filter(m => !m.synced);

      if (pendingMeals.length > 0) {
        console.log(`🔄 Sincronizando ${pendingMeals.length} registros offline pendentes...`);

        for (const meal of pendingMeals) {
          meal.synced = true;
          await window.dbEngine.put('meal_logs', meal);
        }

        console.log('✅ Todos os registros offline foram sincronizados com sucesso.');
      }
    } catch (err) {
      console.warn('⚠️ Falha durante a sincronização de registros offline:', err);
    }
  }
}

const syncEngine = new NetworkSyncEngine();
window.syncEngine = syncEngine;
