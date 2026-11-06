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
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.syncPendingOfflineRecords();
    });

    // Register Service Worker
    this.registerServiceWorker();

    // Setup Supabase Realtime Subscriptions
    this.setupSupabaseRealtime();

    // Initial check
    this.handleNetworkChange(navigator.onLine);
    this.retryTimer = setInterval(() => {
      this.syncPendingOfflineRecords();
    }, 30000);
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
      } else {
        offlineBar.classList.remove('hidden');
      }
    }
    this.syncPendingOfflineRecords();
  }

  /**
   * Syncs locally stored offline meal records to Supabase Cloud when connection returns.
   */
  async syncPendingOfflineRecords({ manual = false } = {}) {
    if (window.syncControls?.busy && !manual) return;
    if (!window.dbEngine || this.syncing) return;
    this.syncing = true;
    this.lastError = '';
    const today = window.mealValidatorService.getTodayDateString();
    this.setProgress('Conferindo a data das pendências locais…');

    try {
      await window.dbEngine.discardExpiredPending(today);
      if (!window.supabaseClient || !navigator.onLine) return;
      this.deadline = Date.now() + (manual ? 60000 : 20000);
      // Portaria primeiro: preserva a data e o horário capturados sem internet.
      const entries = await window.dbEngine.getAll('school_entries');
      const pendingEntries = entries.filter(e => e.synced !== true && e.entry_date === today);
      let sentEntries = 0;
      this.setProgress(`Entradas enviadas: 0 de ${pendingEntries.length}.`);
      for (const entry of pendingEntries) {
        this.assertSameDay(today);
        const row = { id: entry.id, student_id: entry.student_id, student_name: entry.student_name,
          turma: entry.turma, entry_date: entry.entry_date, entry_time: entry.entry_time, entry_method: entry.entry_method };
        const { error } = await this.syncRequest(window.supabaseClient.from('school_entries').upsert(row, {
          onConflict: 'student_id,entry_date', ignoreDuplicates: true
        }));
        if (error) throw new Error('O servidor não confirmou o envio da entrada. Verifique a conexão e as permissões.');
        await window.dbEngine.put('school_entries', { ...entry, synced: true });
        this.setProgress(`Entradas enviadas: ${++sentEntries} de ${pendingEntries.length}.`);
      }
      const allMeals = await window.dbEngine.getAll('meal_logs');
      const pendingMeals = allMeals.filter(m => m.synced !== true && m.date === today);
      let sentMeals = 0;

      if (pendingMeals.length > 0 && window.supabaseClient && navigator.onLine) {
        console.log(`🔄 Sincronizando ${pendingMeals.length} registros offline pendentes para Supabase...`);

        for (const meal of pendingMeals) {
          this.assertSameDay(today);
          this.setProgress(`Almoços enviados: ${sentMeals} de ${pendingMeals.length}.`);
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

          const { error } = await this.syncRequest(window.supabaseClient.from('meal_logs').upsert(row, {
            onConflict: 'student_id,date',
            ignoreDuplicates: true
          }));
          if (error) throw new Error('O servidor não confirmou o envio do almoço. Verifique a conexão e as permissões.');
          meal.synced = true;
          await window.dbEngine.put('meal_logs', meal);
          this.setProgress(`Almoços enviados: ${++sentMeals} de ${pendingMeals.length}.`);
        }

        const remaining = (await window.dbEngine.getAll('meal_logs')).filter(m => m.synced !== true && m.date === today).length;
        console.log(`Sincronização de almoços concluída: ${remaining} pendentes.`);
      }
    } catch (err) {
      this.lastError = `${err.message} Os registros não enviados continuam neste aparelho.`;
      console.warn('⚠️ Falha durante a sincronização de registros offline:', err);
      if (manual) throw err;
    } finally {
      this.syncing = false;
      this.progress = '';
      this.deadline = null;
      window.syncControls?.refreshStatus();
    }
  }

  setProgress(message) {
    this.progress = message;
    window.syncControls?.refreshStatus();
  }

  assertSameDay(today) {
    if (window.mealValidatorService.getTodayDateString() !== today) {
      throw new Error('O dia mudou. A próxima tentativa fará a limpeza e enviará somente registros do novo dia.');
    }
  }

  syncRequest(query) {
    const remaining = this.deadline - Date.now();
    if (remaining <= 0) throw new Error('O envio atingiu o tempo desta tentativa. Tente novamente para continuar.');
    return this.withTimeout(query, Math.min(8000, remaining));
  }

  async withTimeout(query, ms = 8000) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer;
    try {
      return await Promise.race([
        controller && query.abortSignal ? query.abortSignal(controller.signal) : query,
        new Promise((_, reject) => { timer = setTimeout(() => {
          controller?.abort(); reject(new Error('Sem resposta do servidor. Tente novamente.'));
        }, ms); })
      ]);
    } finally { clearTimeout(timer); }
  }
}

const syncEngine = new NetworkSyncEngine();
window.syncEngine = syncEngine;
