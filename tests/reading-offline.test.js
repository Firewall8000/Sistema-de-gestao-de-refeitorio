const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup(online = false) {
  const records = { school_entries: [], meal_logs: [] };
  const alerts = [], uploads = [];
  const student = { id: 's2', registration: 'R2', name: 'Aluno Teste', grade: '1', turma: 'A', active: true, qrToken: 'token' };
  const window = {
    studentService: { getByQrToken: async () => student, getAllStudents: async () => [student], getDisplayName: (e, s) => s?.name || e.student_name },
    showAlertModal: async a => { alerts.push(a); },
    dbEngine: {
      getAll: async table => records[table],
      getAllByIndex: async table => records[table],
      put: async (table, row) => {
        const idx = records[table].findIndex(r => r.id === row.id);
        if (idx < 0) records[table].push(row); else records[table][idx] = row;
      }
    },
    supabaseClient: { from: table => ({
      insert: async () => ({ error: { message: 'network unavailable' } }),
      upsert: async (row, options) => { uploads.push({ table, row, options }); return { error: null }; }
    }) }
  };
  const context = { window, navigator: { onLine: online }, document: { getElementById: () => null }, console, setTimeout, clearTimeout };
  vm.createContext(context);
  for (const file of ['mealService.js', 'sync.js', 'scanner.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
  }
  const m = window.mealValidatorService;
  m.getScannerMode = () => 'portaria';
  m.updateTodayCounterUI = async () => {};
  m.getTodayEntryForStudent = async () => null;
  m.getTodayMealForStudent = async () => null;
  m.getTodayOrderedEntries = async () => records.school_entries;
  m._fetchTodayMealsRaw = async () => records.meal_logs;
  return { window, context, records, alerts, uploads, m };
}

test('offline portaria confirms once, saves timestamp and uploads on reconnect', async () => {
  const h = setup();
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'token' }), true);
  assert.equal(h.alerts.length, 1);
  assert.match(h.alerts[0].title, /Entrada Registrada/);
  const entry = h.records.school_entries[0];
  assert.equal(entry.synced, false);
  h.context.navigator.onLine = true;
  await h.window.syncEngine.syncPendingOfflineRecords();
  assert.equal(h.uploads[0].table, 'school_entries');
  assert.equal(h.uploads[0].row.entry_time, entry.entry_time);
  assert.equal('synced' in h.uploads[0].row, false);
  assert.equal(h.records.school_entries[0].synced, true);
  await h.window.syncEngine.syncPendingOfflineRecords();
  assert.equal(h.uploads.length, 1);
});

test('offline out-of-order meal is stored and produces one warning modal', async () => {
  const h = setup();
  h.records.school_entries.push({ student_id: 's1' }, { student_id: 's2' });
  h.m.getScannerMode = () => 'refeitorio';
  await h.m.validateAndRecordMeal({ qrToken: 'token' });
  assert.equal(h.records.meal_logs.length, 1);
  assert.equal(h.records.meal_logs[0].synced, false);
  assert.equal(h.alerts.length, 1);
  assert.equal(h.alerts[0].type, 'warning');
  assert.match(h.alerts[0].title, /Liberado/);
});

test('internet indicator does not mark failed cloud writes as synchronized', async () => {
  const h = setup(true);
  await h.m.validateAndRecordMeal({ qrToken: 'token' });
  assert.equal(h.records.school_entries[0].synced, false);
  h.records.school_entries.unshift({ student_id: 's1', synced: true });
  h.m.getScannerMode = () => 'refeitorio';
  await h.m.validateAndRecordMeal({ qrToken: 'token' });
  assert.equal(h.records.meal_logs[0].synced, false);
});

test('failed sync keeps pending data and retries without parallel upload', async () => {
  const h = setup(true);
  h.records.school_entries.push({ id: 'entry', student_id: 's2', entry_date: '2026-10-23', synced: false });
  let finish;
  h.window.supabaseClient.from = () => ({ upsert: () => new Promise(resolve => { finish = resolve; }) });
  const first = h.window.syncEngine.syncPendingOfflineRecords();
  await Promise.resolve();
  await h.window.syncEngine.syncPendingOfflineRecords();
  finish({ error: { message: 'unavailable' } });
  await first;
  assert.equal(h.records.school_entries[0].synced, false);
  assert.equal(h.window.syncEngine.syncing, false);
});

test('another reading is ignored while the result modal is open', async () => {
  const h = setup();
  let dismiss;
  h.window.showAlertModal = () => new Promise(resolve => { dismiss = resolve; });
  const first = h.m.validateAndRecordMeal({ qrToken: 'token' });
  while (!dismiss) await Promise.resolve();
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'other' }), false);
  dismiss();
  await first;
  assert.equal(h.records.school_entries.length, 1);
  assert.equal(h.m._processingReading, false);
});
