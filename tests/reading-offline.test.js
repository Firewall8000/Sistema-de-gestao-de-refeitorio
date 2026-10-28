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
  const nodes = Object.fromEntries(['validation-banner', 'val-icon', 'val-title', 'val-detail', 'val-sub'].map(id => [id, { style: {}, textContent: '', scrollIntoView() {} }]));
  const context = { window, navigator: { onLine: online }, document: { getElementById: id => nodes[id] || null }, console, setTimeout, clearTimeout };
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
  return { window, context, records, alerts, uploads, m, nodes };
}

test('offline portaria confirms once, saves timestamp and uploads on reconnect', async () => {
  const h = setup();
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'token' }), true);
  assert.equal(h.alerts.length, 0);
  assert.match(h.nodes['val-title'].textContent, /ENTRADA REGISTRADA/);
  assert.equal(h.nodes['validation-banner'].className, 'validation-banner success');
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

test('offline out-of-order meal shows the standard warning banner without extra modal', async () => {
  const h = setup();
  h.records.school_entries.push({ student_id: 's1' }, { student_id: 's2' });
  h.m.getScannerMode = () => 'refeitorio';
  await h.m.validateAndRecordMeal({ qrToken: 'token' });
  assert.equal(h.records.meal_logs.length, 1);
  assert.equal(h.records.meal_logs[0].synced, false);
  assert.equal(h.alerts.length, 0);
  assert.equal(h.nodes['validation-banner'].className, 'validation-banner warning');
  assert.match(h.nodes['val-title'].textContent, /ALMOÇO LIBERADO/);
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

test('another reading is ignored while the first reading is being processed', async () => {
  const h = setup();
  let dismiss;
  const put = h.window.dbEngine.put;
  h.window.dbEngine.put = async (...args) => {
    await new Promise(resolve => { dismiss = resolve; });
    return put(...args);
  };
  const first = h.m.validateAndRecordMeal({ qrToken: 'token' });
  while (!dismiss) await Promise.resolve();
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'other' }), false);
  dismiss();
  await first;
  assert.equal(h.records.school_entries.length, 1);
  assert.equal(h.m._processingReading, false);
});


test('slow network falls back within one shared budget and skips network on the next reading', async () => {
  const h = setup(true);
  let started = 0, aborted = false;
  h.context.AbortController = AbortController;
  h.window.dbEngine.getByIndex = async () => ({ id: 's2', registration: 'R2', name: 'Aluno', active: true });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/studentService.js'), 'utf8'), h.context);
  h.window.supabaseClient.from = () => {
    const q = {
      select() { return q; }, eq() { return q; }, maybeSingle() { return q; }, insert() { return q; },
      abortSignal(signal) { signal.addEventListener('abort', () => { aborted = true; }); return q; },
      then() { started++; return new Promise(() => {}); }
    };
    return q;
  };
  const start = Date.now();
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'token' }), true);
  assert.ok(Date.now() - start < 2600, 'network must not block indefinitely');
  assert.equal(aborted, true);
  assert.equal(h.records.school_entries[0].synced, false);
  assert.match(h.nodes['val-sub'].textContent, /Dados locais/);
  assert.equal(started, 1, 'later requests must not receive a new timeout budget');
  await h.m.validateAndRecordMeal({ qrToken: 'other' });
  assert.equal(started, 1, 'cooldown avoids paying for the same network outage on every student');
});

test('slow dashboard does not retain the reading lock', async () => {
  const h = setup();
  h.m.updateTodayCounterUI = () => new Promise(() => {});
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'token' }), true);
  assert.equal(h.m._processingReading, false);
});

test('failed durable storage never shows a successful entry', async () => {
  const h = setup();
  h.window.dbEngine.put = async () => { throw new Error('quota'); };
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'token' }), false);
  assert.equal(h.records.school_entries.length, 0);
  assert.notEqual(h.nodes['validation-banner'].className, 'validation-banner success');
});

test('authoritative missing or inactive students cannot use an old active cache', async () => {
  const h = setup(true);
  h.window.dbEngine.getByIndex = async () => ({ id: 'old', active: true });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/studentService.js'), 'utf8'), h.context);
  let data = null;
  h.window.supabaseClient.from = () => {
    const q = { select() { return q; }, eq() { return q; }, maybeSingle: async () => ({ data, error: null }) };
    return q;
  };
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'old' }), false);
  data = { id: 'old', active: false };
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'old' }), false);
  assert.equal(h.records.school_entries.length, 0);
});


test('local duplicate checks still prevent a second entry and a second meal', async () => {
  const h = setup();
  delete h.m.getTodayEntryForStudent;
  delete h.m.getTodayMealForStudent;
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'token' }), true);
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'token' }), false);
  assert.equal(h.records.school_entries.length, 1);
  h.m.getScannerMode = () => 'refeitorio';
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'token' }), true);
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'token' }), false);
  assert.equal(h.records.meal_logs.length, 1);
});

test('camera decoder pauses during validation and resumes after the durable result', async () => {
  const h = setup();
  const scanner = h.window.qrScannerController;
  const calls = [];
  scanner.isScanning = true;
  scanner.html5Qrcode = { pause() { calls.push('pause'); }, resume() { calls.push('resume'); } };
  await scanner.handleDecodedToken('token');
  assert.deepEqual(calls, ['pause', 'resume']);
  assert.equal(h.records.school_entries.length, 1);
  clearTimeout(scanner.cooldownTimer);
});
