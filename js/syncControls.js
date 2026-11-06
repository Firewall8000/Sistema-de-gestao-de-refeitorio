/* Per-browser reconciliation and offline preparation. No remote device panel. */
class SyncControls {
  constructor() {
    this.busy = false;
    this.message = '';
    this.revision = 0;
  }

  init() {
    document.getElementById('btn-sync-check')?.addEventListener('click', () => this.run());
    window.addEventListener('online', () => this.checkConnection());
    window.addEventListener('offline', () => { this.reachable = false; this.refreshStatus(); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.refreshStatus();
    });
    this.refreshStatus();
    // Read local state only: works across tabs without adding network requests.
    this.statusTimer = setInterval(() => this.refreshStatus(), 5000);
    this.checkConnection();
    this.connectivityTimer = setInterval(() => this.checkConnection(), 15000);
  }

  async checkConnection() {
    if (this.probing || this.busy || window.syncEngine?.syncing) return;
    if (!navigator.onLine || !window.supabaseClient) { this.reachable = false; await this.refreshStatus(); return; }
    this.probing = true;
    try {
      const response = await window.syncEngine.withTimeout(
        window.supabaseClient.from('students').select('id').limit(1), 4000);
      // A database permission error still proves the server is reachable.
      this.reachable = response?.status !== 0;
    } catch (error) { this.reachable = false; }
    finally { this.probing = false; await this.refreshStatus(); }
  }

  async localRecords() {
    const [entries, meals] = await Promise.all([
      window.dbEngine.getAll('school_entries'), window.dbEngine.getAll('meal_logs')
    ]);
    return [...entries.map(row => ({ table: 'school_entries', row })),
      ...meals.map(row => ({ table: 'meal_logs', row }))];
  }

  dateOf(item) { return item.table === 'school_entries' ? item.row.entry_date : item.row.date; }
  studentOf(item) { return item.table === 'school_entries' ? item.row.student_id : item.row.studentId; }

  async refreshStatus() {
    const button = document.getElementById('btn-sync-check');
    const status = document.getElementById('sync-device-status');
    if (!button || !status) return;
    const revision = ++this.revision;
    const online = navigator.onLine && this.reachable !== false;
    const uploading = !!window.syncEngine?.syncing;
    button.disabled = !online || this.busy || uploading;
    button.textContent = this.busy ? 'Sincronizando e conferindo…'
      : uploading ? 'Enviando registros automaticamente…'
      : online ? 'Sincronizar e Conferir' : 'Atualizar dados para uso offline';
    button.setAttribute('aria-busy', String(this.busy || uploading));
    // Show the reason immediately, even before reading the local database.
    if (uploading) status.textContent = `${window.syncEngine.progress || 'Enviando registros…'} Aguarde o envio terminar para conferir.`;
    else if (this.busy) status.textContent = this.message;
    try {
      const [records, snapshot] = await Promise.all([
        this.localRecords(), window.dbEngine.get('offline_meta', 'snapshot')
      ]);
      if (revision !== this.revision) return;
      const pending = records.filter(item => item.row.synced !== true).length;
      const issues = records.filter(item => item.row.syncIssue);
      const unchecked = records.filter(item => item.row.synced === true && !item.row.verifiedAt && !item.row.syncIssue).length;
      button.classList.toggle('sync-attention', pending > 0 || issues.length > 0 || unchecked > 0);
      let summary = `${pending} pendente(s) de envio • ${unchecked} aguardando conferência • ${issues.length} com divergência ou sem confirmação.`;
      if (records.length === 0) summary = 'Nenhum registro salvo neste aparelho para conferir.';
      else if (!pending && !issues.length && !unchecked) {
        const oldest = Math.min(...records.map(item => Date.parse(item.row.verifiedAt)));
        summary = `${records.length} registro(s) conferido(s) no Supabase. Conferência mais antiga: ${new Date(oldest).toLocaleString('pt-BR')}.`;
      }
      if (!online) summary += '\nSem acesso confirmado ao servidor. Conecte-se para enviar registros e baixar dados para uso offline; a conexão será testada novamente automaticamente.';
      if (this.busy || this.message) summary += `\n${this.message}`;
      if (uploading) summary += `\n${window.syncEngine.progress || 'Enviando registros…'} Aguarde o envio terminar para conferir.`;
      else if (window.syncEngine?.lastError) summary += `\n${window.syncEngine.lastError}`;
      if (snapshot) {
        summary += `\nDados offline de ${snapshot.date}: ${snapshot.students} cadastros, ${snapshot.entries} entradas e ${snapshot.meals} registros de almoço. Atualizados em ${new Date(snapshot.preparedAt).toLocaleString('pt-BR')}.`;
        if (snapshot.date !== window.mealValidatorService.getTodayDateString()) summary += '\nOs dados offline são de outro dia. Atualize antes do atendimento.';
      } else summary += '\nDados para uso offline ainda não preparados por este botão.';
      status.textContent = summary;
      const details = document.getElementById('sync-device-issues');
      const list = document.getElementById('sync-device-issue-list');
      if (details && list) {
        details.hidden = issues.length === 0;
        list.replaceChildren();
        for (const item of issues) {
          const li = document.createElement('li');
          li.textContent = `${item.table === 'school_entries' ? 'Entrada' : 'Almoço'} • ${this.dateOf(item)} • ${item.row.student_name || item.row.studentName || this.studentOf(item)}: ${item.row.syncIssue}`;
          list.appendChild(li);
        }
      }
    } catch (error) {
      if (revision === this.revision) {
        status.textContent = 'Não foi possível conferir o armazenamento deste aparelho. Não limpe os dados do navegador; tente novamente.';
        button.classList.add('sync-attention');
      }
    }
  }

  async fetchAll(table, date = null) {
    const rows = [];
    const size = 500;
    for (let offset = 0; ; offset += size) {
      if (!navigator.onLine) throw new Error('A conexão caiu. Os registros locais foram preservados.');
      let query = window.supabaseClient.from(table).select('*');
      if (date) query = query.eq(table === 'school_entries' ? 'entry_date' : 'date', date);
      const { data, error } = await window.syncEngine.withTimeout(query.order('id').range(offset, offset + size - 1));
      if (error || !Array.isArray(data)) throw new Error('O servidor não confirmou a consulta. Verifique a conexão e as permissões.');
      rows.push(...data);
      if (data.length < size) return rows;
    }
  }

  difference(item, remote) {
    if (!remote) return 'Não localizado no Supabase ou sem permissão para consultar essa data.';
    const entry = item.table === 'school_entries';
    const localTime = Date.parse(entry ? item.row.entry_time : item.row.timestamp);
    const remoteTime = Date.parse(entry ? remote.entry_time : remote.timestamp);
    if (!Number.isFinite(localTime) || !Number.isFinite(remoteTime) || localTime !== remoteTime) {
      return 'Horário local diferente do Supabase. Confira a ordem da fila; nenhum horário foi sobrescrito.';
    }
    if (!entry) {
      if (item.row.studentRegistration !== remote.student_registration) return 'Matrícula diferente no Supabase.';
      const localStatus = item.row.mealStatus || (item.row.validationMethod === 'AUSENTE' ? 'ausente' : 'presencial');
      const remoteStatus = remote.meal_status || (remote.validation_method === 'AUSENTE' ? 'ausente' : 'presencial');
      if (localStatus !== remoteStatus) return 'Situação do almoço diferente no Supabase.';
    }
    return null;
  }

  async verify(records) {
    const groups = new Map();
    for (const item of records) {
      const key = `${item.table}|${this.dateOf(item)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    let issues = 0;
    for (const group of groups.values()) {
      const remote = await this.fetchAll(group[0].table, this.dateOf(group[0]));
      const byStudent = new Map(remote.map(row => [row.student_id, row]));
      for (const item of group) {
        const current = await window.dbEngine.get(item.table, item.row.id);
        if (!current || JSON.stringify(current) !== JSON.stringify(item.row)) continue;
        const issue = this.difference(item, byStudent.get(this.studentOf(item)));
        if (issue) issues++;
        await window.dbEngine.put(item.table, { ...current,
          synced: issue ? current.synced : true,
          verifiedAt: issue ? null : new Date().toISOString(), syncIssue: issue });
      }
    }
    return issues;
  }

  async prepareOffline() {
    const date = window.mealValidatorService.getTodayDateString();
    const [students, entries, meals] = await Promise.all([
      this.fetchAll('students'), this.fetchAll('school_entries', date), this.fetchAll('meal_logs', date)
    ]);
    if (date !== window.mealValidatorService.getTodayDateString()) throw new Error('O dia mudou. Atualize os dados novamente.');
    const preparedAt = new Date().toISOString();
    await window.dbEngine.saveOfflineSnapshot({ date, preparedAt,
      students: window.studentService._mapFromSupabase(students),
      entries: entries.map(row => ({ ...row, synced: true, verifiedAt: preparedAt })),
      meals: meals.map(row => ({ ...window.mealValidatorService._mapFromSupabase(row), synced: true, verifiedAt: preparedAt })) });
  }

  async run() {
    if (this.busy || window.syncEngine?.syncing) { await this.refreshStatus(); return; }
    if (!navigator.onLine || this.reachable === false) { await this.refreshStatus(); return; }
    this.busy = true;
    this.message = 'Enviando registros pendentes…';
    try {
      await this.refreshStatus();
      if (!window.supabaseClient) throw new Error('Conexão com o Supabase não configurada.');
      await window.syncEngine.syncPendingOfflineRecords({ manual: true });
      this.message = 'Conferindo aluno, data e horário dos registros no Supabase…';
      await this.refreshStatus();
      const records = await this.localRecords();
      const issues = await this.verify(records);
      this.message = 'Baixando cadastros e registros de hoje para uso offline…';
      await this.refreshStatus();
      await this.prepareOffline();
      this.message = issues
        ? 'Dados offline atualizados. Existem registros que precisam de atenção; consulte os detalhes abaixo.'
        : 'Conferência concluída e dados offline atualizados. Novas leituras ou novas entradas podem exigir outra atualização.';
    } catch (error) {
      this.message = `Não foi possível concluir: ${error.message}`;
    } finally {
      this.busy = false;
      await this.refreshStatus();
    }
  }
}

window.syncControls = new SyncControls();
