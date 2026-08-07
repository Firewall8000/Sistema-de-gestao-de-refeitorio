/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Sync Engine & Supabase Realtime Subscriptions
   ========================================================================== */

class NetworkSyncEngine {
  constructor() {
    this.isOnline = navigator.onLine;
    this.realtimeChannel = null;
  }

  init() {
    // Listen for online / offline network status changes
    window.addEventListener('online', () => this.handleNetworkChange(true));
    window.addEventListener('offline', () => this.handleNetworkChange(false));

    // Register Service Worker
    this.registerServiceWorker();

    // Setup Supabase Realtime Subscriptions
    this.setupSupabaseRealtime();

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
   * Sets up Supabase Realtime listener to sync changes across all devices in real-time.
   */
  setupSupabaseRealtime() {
    if (!window.supabaseClient) return;

    try {
      this.realtimeChannel = window.supabaseClient
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'students' },
          (payload) => {
            console.log('⚡ Mudança de Alunos detectada na Nuvem:', payload);
            if (typeof window.refreshAllUI === 'function') window.refreshAllUI();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'meal_logs' },
          (payload) => {
            console.log('⚡ Novo Registro de Almoço detectado na Nuvem:', payload);
            if (typeof window.refreshAllUI === 'function') window.refreshAllUI();
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('📡 Realtime Supabase Ativo: Sincronização multi-dispositivo ligada!');
          }
        });
    } catch (err) {
      console.warn('⚠️ Não foi possível ligar o Realtime Supabase:', err);
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
   * Syncs locally stored offline meal records to Supabase Cloud when connection returns.
   */
  async syncPendingOfflineRecords() {
    if (!window.dbEngine) return;

    try {
      const allMeals = await window.dbEngine.getAll('meal_logs');
      const pendingMeals = allMeals.filter(m => !m.synced);

      if (pendingMeals.length > 0 && window.supabaseClient && navigator.onLine) {
        console.log(`🔄 Sincronizando ${pendingMeals.length} registros offline pendentes para Supabase...`);

        for (const meal of pendingMeals) {
          const row = {
            id: meal.id,
            student_id: meal.studentId,
            student_registration: meal.studentRegistration,
            student_name: meal.studentName,
            turma: meal.turma,
            grade: meal.grade,
            date: meal.date,
            timestamp: meal.timestamp,
            qr_token_used: meal.qrTokenUsed,
            synced: true,
            validation_method: meal.validationMethod
          };

          const { error } = await window.supabaseClient.from('meal_logs').upsert(row);
          if (!error) {
            meal.synced = true;
            await window.dbEngine.put('meal_logs', meal);
          }
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
