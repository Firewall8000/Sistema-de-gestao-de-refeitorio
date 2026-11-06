/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Database Layer (IndexedDB Wrapper & Local Storage Engine)
   ========================================================================== */

const DB_NAME = 'SantosDumontRefectoryDB';
const DB_VERSION = 3;

class RefectoryDatabase {
  constructor() {
    this.db = null;
  }

  /**
   * Initializes the IndexedDB database and creates necessary object stores.
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('offline_meta')) {
          db.createObjectStore('offline_meta', { keyPath: 'id' });
        }

        // Store 1: Students
        if (!db.objectStoreNames.contains('students')) {
          const studentStore = db.createObjectStore('students', { keyPath: 'id' });
          studentStore.createIndex('registration', 'registration', { unique: true });
          studentStore.createIndex('qrToken', 'qrToken', { unique: true });
          studentStore.createIndex('grade', 'grade', { unique: false });
          studentStore.createIndex('active', 'active', { unique: false });
        }

        // Store 2: Meal Logs
        if (!db.objectStoreNames.contains('meal_logs')) {
          const mealStore = db.createObjectStore('meal_logs', { keyPath: 'id' });
          mealStore.createIndex('date', 'date', { unique: false });
          mealStore.createIndex('studentRegistration', 'studentRegistration', { unique: false });
          mealStore.createIndex('date_student', ['date', 'studentRegistration'], { unique: true });
        }

        // Store 3: Users
        if (!db.objectStoreNames.contains('users')) {
          const userStore = db.createObjectStore('users', { keyPath: 'id' });
          userStore.createIndex('username', 'username', { unique: true });
        }

        // Store 4: School Entries (Portaria)
        if (!db.objectStoreNames.contains('school_entries')) {
          const entryStore = db.createObjectStore('school_entries', { keyPath: 'id' });
          entryStore.createIndex('entry_date', 'entry_date', { unique: false });
          entryStore.createIndex('student_id', 'student_id', { unique: false });
          entryStore.createIndex('date_student', ['entry_date', 'student_id'], { unique: true });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.db.onversionchange = () => this.db.close();
        console.log('✅ IndexedDB SantosDumontDB inicializado com sucesso.');
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('❌ Erro ao abrir IndexedDB:', event.target.error);
        reject(event.target.error);
      };
      request.onblocked = () => reject(new Error('Feche as outras abas do sistema e reabra para atualizar o armazenamento.'));
    });
  }

  /**
   * Helper to execute a transaction on a store.
   */
  _transaction(storeName, mode = 'readonly') {
    if (!this.db) {
      throw new Error('O banco de dados ainda não foi inicializado.');
    }
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  /**
   * Adds or updates an item in a store.
   */
  async put(storeName, item) {
    return new Promise((resolve, reject) => {
      const store = this._transaction(storeName, 'readwrite');
      const request = store.put(item);
      store.transaction.oncomplete = () => resolve(item);
      store.transaction.onabort = () => reject(store.transaction.error || new Error('Gravação local cancelada.'));
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Gets an item by its primary key.
   */
  async get(storeName, key) {
    return new Promise((resolve, reject) => {
      const store = this._transaction(storeName, 'readonly');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Gets an item by an index value.
   */
  async getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const store = this._transaction(storeName, 'readonly');
      const index = store.index(indexName);
      const request = index.get(value);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Retrieves all items from a store.
   */
  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const store = this._transaction(storeName, 'readonly');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Retrieves all items matching an index value.
   */
  async getAllByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const store = this._transaction(storeName, 'readonly');
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // All-or-nothing preparation. Preserve pending/conflicting records, including
  // readings committed while the download was running, and keep previous days.
  async saveOfflineSnapshot({ date, students, entries, meals, preparedAt }) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['students', 'school_entries', 'meal_logs', 'offline_meta'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('Preparação offline cancelada.'));
      const studentStore = tx.objectStore('students');
      studentStore.clear();
      students.forEach(s => studentStore.put(s));
      const merge = (table, incoming, dateKey, studentKey) => {
        const store = tx.objectStore(table);
        const request = store.getAll();
        request.onsuccess = () => {
          const current = request.result.filter(row => row[dateKey] === date);
          const protectedRows = current.filter(row => row.synced !== true || row.syncIssue || !row.verifiedAt);
          const protectedKeys = new Set(protectedRows.map(row => row[studentKey]));
          current.filter(row => row.synced === true && !row.syncIssue && row.verifiedAt).forEach(row => store.delete(row.id));
          incoming.filter(row => !protectedKeys.has(row[studentKey])).forEach(row => store.put(row));
        };
      };
      merge('school_entries', entries, 'entry_date', 'student_id');
      merge('meal_logs', meals, 'date', 'studentRegistration');
      tx.objectStore('offline_meta').put({ id: 'snapshot', date, preparedAt,
        students: students.length, entries: entries.length, meals: meals.length });
    });
  }

  /**
   * Deletes an item by key.
   */
  async delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const store = this._transaction(storeName, 'readwrite');
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Delete only unsent readings dated before the school day, atomically.
  // Confirmed history, students, malformed dates and future dates are preserved.
  async discardExpiredPending(today) {
    const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
      && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
    if (!validDate(today)) throw new Error('Data inválida para limpeza das pendências.');
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['school_entries', 'meal_logs', 'offline_meta'], 'readwrite');
      const removed = { entries: 0, meals: 0 };
      tx.oncomplete = () => resolve(removed);
      tx.onabort = () => reject(tx.error || new Error('Não foi possível limpar pendências antigas.'));
      let finished = 0;
      for (const [table, dateKey, countKey] of [
        ['school_entries', 'entry_date', 'entries'], ['meal_logs', 'date', 'meals']
      ]) {
        const request = tx.objectStore(table).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            const row = cursor.value;
            if (row.synced !== true && validDate(row[dateKey]) && row[dateKey] < today) {
              cursor.delete(); removed[countKey]++;
            }
            cursor.continue();
          } else if (++finished === 2 && (removed.entries || removed.meals)) {
            const meta = tx.objectStore('offline_meta');
            const previous = meta.get('pending_cleanup');
            previous.onsuccess = () => {
              const old = previous.result?.date === today ? previous.result : {};
              meta.put({ id: 'pending_cleanup', date: today, at: new Date().toISOString(),
                entries: (old.entries || 0) + removed.entries, meals: (old.meals || 0) + removed.meals });
            };
          }
        };
      }
    });
  }

  /**
   * Seeds initial seed data (mock students and users) if database is empty.
   */
  async seedInitialData() {
    const students = await this.getAll('students');
    if (students.length === 0) {
      console.log('🌱 Semeando dados iniciais de demonstração...');
      
      const seedStudents = [
        {
          id: 'std-101',
          name: 'Ana Clara Souza',
          registration: '2026001',
          grade: '1º Ano',
          turma: 'Turma A',
          active: true,
          qrToken: 'TOKEN_SD_2026001',
          createdAt: new Date().toISOString()
        },
        {
          id: 'std-102',
          name: 'Bruno Lima Fernandes',
          registration: '2026002',
          grade: '1º Ano',
          turma: 'Turma B',
          active: true,
          qrToken: 'TOKEN_SD_2026002',
          createdAt: new Date().toISOString()
        },
        {
          id: 'std-103',
          name: 'Carla Beatriz Mendes',
          registration: '2026003',
          grade: '2º Ano',
          turma: 'Turma A',
          active: true,
          qrToken: 'TOKEN_SD_2026003',
          createdAt: new Date().toISOString()
        },
        {
          id: 'std-104',
          name: 'Daniel Santos Rocha',
          registration: '2026004',
          grade: '3º Ano',
          turma: 'Turma A',
          active: true,
          qrToken: 'TOKEN_SD_2026004',
          createdAt: new Date().toISOString()
        }
      ];

      for (const s of seedStudents) {
        await this.put('students', s);
      }
    }
  }

  /**
   * Exports all database stores as a JSON backup file.
   */
  async exportDatabaseJson() {
    const students = await this.getAll('students');
    const mealLogs = await this.getAll('meal_logs');
    const users = await this.getAll('users');

    const backupData = {
      app: 'SantosDumontRefectoryDB',
      exportedAt: new Date().toISOString(),
      stores: {
        students,
        meal_logs: mealLogs,
        users
      }
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `Backup_SantosDumont_DB_${dateStr}.json`;
    link.click();
  }

  /**
   * Imports database stores from a JSON backup object.
   */
  async importDatabaseJson(jsonData) {
    if (!jsonData || !jsonData.stores) {
      throw new Error('Arquivo de backup (.JSON) inválido.');
    }

    if (jsonData.stores.students && Array.isArray(jsonData.stores.students)) {
      for (const student of jsonData.stores.students) {
        await this.put('students', student);
      }
    }

    if (jsonData.stores.meal_logs && Array.isArray(jsonData.stores.meal_logs)) {
      for (const meal of jsonData.stores.meal_logs) {
        await this.put('meal_logs', meal);
      }
    }

    return true;
  }
}

// Global Singleton Instance
const dbEngine = new RefectoryDatabase();
window.dbEngine = dbEngine;
