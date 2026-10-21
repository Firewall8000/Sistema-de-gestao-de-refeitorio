const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const clone = value => JSON.parse(JSON.stringify(value));
const read = file => fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');

function setup(options = {}) {
  const students = [1, 2, 3, 4].map(n => ({
    id: `s${n}`, name: n === 3 ? 'Nome Antigo' : `Aluno ${n}`,
    registration: `R${n}`, grade: '1º Ano', turma: 'A', active: true,
    qr_token: `QR${n}`, photo_url: `photo${n}`, bound_device_id: `device${n}`,
    created_at: '2026-01-01T00:00:00Z'
  }));
  const entries = students.map((s, i) => ({
    id: `e${i}`, student_id: s.id, student_name: s.name,
    entry_date: '2026-10-20', entry_time: `2026-10-20T09:00:0${i}Z`
  }));
  const cloud = { students, school_entries: entries, meal_logs: [
    { id: 'm1', student_id: 's1', student_name: 'Aluno 1', validation_method: 'QR_CODE', timestamp: '2026-10-20T14:00:00Z' },
    { id: 'm2', student_id: 's2', student_name: 'Aluno 2', validation_method: 'AUSENTE', timestamp: '2026-10-20T14:01:00Z' }
  ] };
  const cache = clone(cloud);
  if (options.emptyCache) cache.students = [];
  const writes = [];
  const callbacks = [];
  const timers = [];
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      innerHTML: '', textContent: '', addEventListener() {}, querySelector() { return null; }
    });
    return nodes.get(id);
  };
  const client = {
    channel() {
      const channel = { on(event, filter, callback) {
        callbacks.push({ filter, callback }); return channel;
      }, subscribe() { return channel; } };
      return channel;
    },
    from(table) {
      let patch, id;
      const query = {
        update(value) { patch = value; return query; },
        eq(key, value) { if (key === 'id') id = value; return query; },
        select() { return query; }, order() { return query; },
        async single() {
          writes.push({ table, id, patch: clone(patch) });
          if (options.throwNetwork) throw new Error('network');
          if (options.error) return { error: options.error };
          const row = cloud[table].find(s => s.id === id);
          if (options.noRow || !row) return { data: null, error: null };
          Object.assign(row, patch);
          return { data: clone(row), error: null };
        },
        then(resolve, reject) {
          // Exercise the local fallback for the legacy SQL view.
          return Promise.resolve(table === 'lunch_queue_today'
            ? { error: { code: 'view_unavailable' } }
            : { data: clone(cloud[table]), error: null }).then(resolve, reject);
        }
      };
      return query;
    }
  };
  const window = {
    supabaseClient: client,
    dbEngine: {
      async clear(t) { cache[t] = []; },
      async getAll(t) { return clone(cache[t]); },
      async getAllByIndex(t) { return clone(cache[t]); },
      async put(t, row) {
        if (options.cacheFailure) throw new Error('cache unavailable');
        cache[t] = cache[t].filter(s => s.id !== row.id).concat(clone(row));
        return row;
      }
    }
  };
  const navigator = { onLine: options.online !== false };
  const context = vm.createContext({
    window, navigator, document: { hidden: false, getElementById: node },
    localStorage: { getItem() { return null; } },
    setInterval(fn) { timers.push(fn); return 1; },
    console: { log() {}, warn() {}, error() {} }
  });
  for (const file of ['studentService.js', 'mealService.js', 'dashboard.js', 'sync.js']) {
    vm.runInContext(read(file), context);
  }
  const s = window.studentService;
  const m = window.mealValidatorService;
  const d = window.dashboardController;
  m.getTodayDateString = () => '2026-10-20';
  return { window, context, cloud, cache, writes, node, callbacks, timers, s, m, d,
    edit: () => s.saveStudent({ id: 's3', name: 'Nome Corrigido', registration: 'R3', grade: '1º Ano', turma: 'A' }) };
}

test('rename preserves arrival order, next student, meal states and all historical records', async () => {
  const h = setup();
  const before = clone(h.cloud);
  const orderBefore = await h.m.getTodayOrderedEntries();
  const stateBefore = h.m._computeQueueState(orderBefore, h.cloud.meal_logs);
  await h.edit();
  const orderAfter = await h.m.getTodayOrderedEntries();
  const stateAfter = h.m._computeQueueState(orderAfter, h.cloud.meal_logs);
  assert.deepEqual(clone(orderAfter), clone(orderBefore));
  assert.equal(orderAfter.findIndex(e => e.student_id === 's3'), 2);
  assert.equal(stateBefore.nextIdx, 2);
  assert.equal(stateAfter.nextIdx, 2);
  assert.ok(stateAfter.findMeal(orderAfter[0]));
  assert.equal(stateAfter.isAbsent(orderAfter[1]), true);
  assert.deepEqual(h.cloud.school_entries, before.school_entries);
  assert.deepEqual(h.cloud.meal_logs, before.meal_logs);
  const updated = h.cloud.students[2];
  for (const key of ['id', 'qr_token', 'photo_url', 'bound_device_id', 'active', 'created_at']) {
    assert.equal(updated[key], before.students[2][key]);
  }
  assert.deepEqual(Object.keys(h.writes[0].patch).sort(), ['grade', 'name', 'registration', 'turma', 'updated_at']);
  assert.equal(h.writes[0].table, 'students');
});

test('corrected name appears in both TV columns, scanner and legacy fallback; third stays third', async () => {
  const h = setup();
  await h.edit();
  await h.d.refreshLiveQueues();
  for (const id of ['tv-feed-portaria-list', 'scanner-queue-tbody', 'lunch-queue-table-body']) {
    const html = h.node(id).innerHTML;
    assert.ok(html.includes('Nome Corrigido'), id);
    assert.ok(!html.includes('Nome Antigo'), id);
  }
  for (const id of ['tv-feed-portaria-list', 'scanner-queue-tbody']) {
    const html = h.node(id).innerHTML;
    assert.ok(html.indexOf('Aluno 2') < html.indexOf('Nome Corrigido'), id);
    assert.ok(html.indexOf('Nome Corrigido') < html.indexOf('Aluno 4'), id);
  }
  assert.ok(!h.node('tv-feed-refeitorio-list').innerHTML.includes('Nome Corrigido'));
  h.cloud.meal_logs.push({ student_id: 's3', validation_method: 'QR_CODE', timestamp: '2026-10-20T15:00:00Z' });
  await h.d.refreshTvFeed();
  assert.match(h.node('tv-feed-refeitorio-list').innerHTML, /Nome Corrigido/);
  assert.doesNotMatch(h.node('tv-feed-refeitorio-list').innerHTML, /Nome Antigo/);
});

test('absence buttons are admin-only, only for pending arrivals, never in served column', async () => {
  const h = setup();
  h.window.authManager = { isAdmin: () => true };
  await h.d.refreshTvFeed();
  const html = h.node('tv-feed-portaria-list').innerHTML;
  assert.match(html, /data-absence-student="s3"/);
  assert.doesNotMatch(html, /data-absence-student="s[12]"/);
  assert.doesNotMatch(h.node('tv-feed-refeitorio-list').innerHTML, /data-absence-student/);
  h.window.authManager.isAdmin = () => false;
  await h.d.refreshTvFeed();
  assert.doesNotMatch(h.node('tv-feed-portaria-list').innerHTML, /data-absence-student/);
});

test('confirmed departure preserves arrival data and writes absence only after confirmation', async () => {
  const h = setup();
  const before = clone(h.cloud.school_entries);
  const saved = [];
  h.window.authManager = { isAdmin: () => true };
  h.m.getTodayMealForStudent = async () => null;
  h.m.updateTodayCounterUI = async () => {};
  h.window.dashboardController = null;
  h.window.supabaseClient.from = () => ({ insert: async row => { saved.push(row); return { error: null }; } });
  h.window.showConfirmModal = async config => {
    assert.match(config.message, /foi embora da escola sem almoçar/);
    assert.equal(saved.length, 0);
    return true;
  };
  h.m.getTodayOrderedEntries = async () => before;
  h.window.studentService.getAllStudents = async () => h.cloud.students;
  assert.equal(await h.m.markStudentAbsentFromQueue('s3'), true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].validation_method, 'AUSENTE');
  assert.deepEqual(h.cloud.school_entries, before);
});

test('absence refuses cancellation, missing arrival, existing meal and database rejection', async () => {
  for (const scenario of ['cancel', 'no-entry', 'served', 'error', 'operator']) {
    const h = setup();
    let writes = 0;
    h.window.authManager = { isAdmin: () => scenario !== 'operator' };
    h.m.getTodayOrderedEntries = async () => scenario === 'no-entry' ? [] : h.cloud.school_entries;
    h.window.studentService.getAllStudents = async () => h.cloud.students;
    h.m.getTodayMealForStudent = async () => scenario === 'served' ? { id: 'existing' } : null;
    h.window.showConfirmModal = async () => scenario !== 'cancel';
    h.window.showAlertModal = async () => {};
    h.window.supabaseClient.from = () => ({ insert: async () => ({ error: { code: '23505' } }) });
    h.window.dbEngine.put = async () => { writes++; };
    assert.equal(await h.m.markStudentAbsentFromQueue('s3'), false, scenario);
    assert.equal(writes, 0, scenario);
  }
});

test('an empty student cache cannot cause QR regeneration or loss of photos', async () => {
  const h = setup({ emptyCache: true });
  const saved = await h.edit();
  assert.equal(saved.qrToken, 'QR3');
  assert.equal(saved.photo_url, 'photo3');
  assert.equal(saved.boundDeviceId, 'device3');
  assert.equal(h.cloud.students.length, 4);
});

test('offline, denied updates, missing rows, duplicates and network failures never change local cache', async () => {
  for (const options of [{ online: false }, { error: { code: '42501' } }, { noRow: true },
    { error: { code: '23505' } }, { throwNetwork: true }]) {
    const h = setup(options);
    const before = clone(h.cache);
    await assert.rejects(h.edit());
    assert.deepEqual(h.cache, before);
    assert.equal(h.cloud.students[2].name, 'Nome Antigo');
  }
});

test('confirmed remote update remains successful when writing local cache fails', async () => {
  const h = setup({ cacheFailure: true });
  const saved = await h.edit();
  assert.equal(saved.name, 'Nome Corrigido');
  assert.equal(h.cloud.students[2].name, 'Nome Corrigido');
});

test('missing student uses historical name, and names are escaped when rendered', async () => {
  const h = setup();
  assert.equal(h.s.getDisplayName(h.cloud.school_entries[2], null), 'Nome Antigo');
  h.cloud.students[2].name = '<img src=x onerror=alert(1)>';
  await h.d.refreshTvFeed();
  assert.ok(h.node('tv-feed-portaria-list').innerHTML.includes('&lt;img'));
  assert.ok(!h.node('tv-feed-portaria-list').innerHTML.includes('<img'));
});

test('student realtime event reaches TV refresh via global UI refresh', async () => {
  const h = setup();
  let refreshed = 0;
  const source = read('app.js');
  const fn = source.slice(source.indexOf('async function refreshAllUI()'), source.indexOf('\nfunction updateModalTurmaOptions'));
  h.m.updateScannerUIForMode = () => {};
  h.d.initRealtimeSubscription = () => {};
  h.d.startTvClock = () => {};
  h.d.refreshLiveQueues = async () => { refreshed++; };
  h.context.renderStudentsTable = async () => {};
  vm.runInContext(fn, h.context);
  h.window.refreshAllUI = h.context.refreshAllUI;
  h.window.syncEngine.setupSupabaseRealtime();
  h.callbacks.find(c => c.filter.table === 'students').callback({});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(refreshed, 1);
});

test('polling refreshes open queues without requiring a realtime event', async () => {
  const h = setup();
  let refreshed = 0;
  h.d.loadAuditTable = () => {};
  h.d.refreshLiveQueues = async () => { refreshed++; };
  h.d.initRealtimeSubscription();
  assert.equal(h.timers.length, 1);
  h.timers[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(refreshed, 1);
});

test('an older TV request cannot overwrite the corrected name from a newer request', async () => {
  const h = setup();
  let release, calls = 0;
  h.s.getAllStudents = () => {
    calls++;
    return calls === 1
      ? new Promise(resolve => { release = resolve; })
      : Promise.resolve(h.cloud.students.map(s => ({ ...s, name: s.id === 's3' ? 'Nome Corrigido' : s.name })));
  };
  const old = h.d.refreshTvFeed();
  await new Promise(resolve => setImmediate(resolve));
  await h.d.refreshTvFeed();
  release(h.cloud.students);
  await old;
  assert.ok(h.node('tv-feed-portaria-list').innerHTML.includes('Nome Corrigido'));
  assert.ok(!h.node('tv-feed-portaria-list').innerHTML.includes('Nome Antigo'));
});

test('rename does not introduce a different ordering criterion for equal arrival times', async () => {
  const h = setup();
  h.cloud.school_entries[2].entry_time = h.cloud.school_entries[1].entry_time;
  const before = await h.m.getTodayOrderedEntries();
  await h.edit();
  const after = await h.m.getTodayOrderedEntries();
  assert.deepEqual(clone(after), clone(before));
});

test('an older scanner request cannot restore the previous name', async () => {
  const h = setup();
  let release, calls = 0;
  h.s.getAllStudents = () => ++calls === 1
    ? new Promise(resolve => { release = resolve; })
    : Promise.resolve(h.cloud.students.map(s => ({ ...s, name: s.id === 's3' ? 'Nome Corrigido' : s.name })));
  const old = h.m.renderScannerQueueList();
  await new Promise(resolve => setImmediate(resolve));
  await h.m.renderScannerQueueList();
  release(h.cloud.students);
  await old;
  assert.ok(h.node('scanner-queue-tbody').innerHTML.includes('Nome Corrigido'));
  assert.ok(!h.node('scanner-queue-tbody').innerHTML.includes('Nome Antigo'));
});
