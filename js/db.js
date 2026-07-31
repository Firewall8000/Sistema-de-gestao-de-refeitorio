/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Database Layer (IndexedDB Wrapper & Local Storage Engine)
   ========================================================================== */

const DB_NAME = 'SantosDumontRefectoryDB';
const DB_VERSION = 1;

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
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('✅ IndexedDB SantosDumontDB inicializado com sucesso.');
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('❌ Erro ao abrir IndexedDB:', event.target.error);
        reject(event.target.error);
      };
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
      request.onsuccess = () => resolve(item);
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
}

// Global Singleton Instance
const dbEngine = new RefectoryDatabase();
window.dbEngine = dbEngine;
