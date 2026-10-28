const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup(online = true) {
  const student = { id: 's2', name: '<Aluno>', registration: '0012', grade: '1º Ano', turma: 'A', active: true };
  const entries = [
    { id: 'e2', student_id: 's2', entry_time: '2026-10-28T10:02:00Z' },
    { id: 'e1', student_id: 's1', entry_time: '2026-10-28T10:01:00Z' }
  ];
  const cloud = { students: student, school_entries: entries };
  const calls = [];
  const failWrite = () => { throw new Error('Consultation must not write or validate a meal'); };
  const window = {
    dbEngine: { getByIndex: async () => student, getAllByIndex: async () => entries, put: failWrite },
    supabaseClient: { rpc: failWrite, from(table) {
      calls.push(table);
      const q = { select() { return q; }, eq(key, value) { calls.push([key, value]); return q; },
        order() { return q; }, maybeSingle() { return q; },
        then(resolve, reject) { return Promise.resolve({ data: cloud[table], error: null }).then(resolve, reject); } };
      return q;
    } }
  };
  const nodes = Object.fromEntries(['input-position-registration', 'btn-position-lookup', 'position-lookup-result', 'form-position-lookup'].map(id => [id, {
    value: '0012', textContent: '', disabled: false, focus() {}, setAttribute() {}
  }]));
  const context = { window, document: { getElementById: id => nodes[id], addEventListener() {} },
    navigator: { onLine: online }, console, setTimeout, clearTimeout, AbortController };
  vm.createContext(context);
  for (const file of ['mealService.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
  }
  const service = window.mealValidatorService;
  service.getTodayDateString = () => '2026-10-28';
  service.validateAndRecordMeal = failWrite;
  return { service, context, window, cloud, nodes, entries, calls };
}

test('position uses all arrivals, preserves leading zeros and makes no writes or registration RPC', async () => {
  const h = setup();
  h.service._processingReading = true;
  h.service._readingDeadline = 123;
  const result = await h.service.getQueuePosition(' 0012 ');
  assert.equal(result.position, 2);
  assert.equal(result.localOnly, false);
  assert.ok(h.calls.some(c => Array.isArray(c) && c[0] === 'registration' && c[1] === '0012'));
  assert.equal(h.calls.includes('meal_logs'), false, 'served students must retain their arrival position');
  assert.equal(h.service._readingDeadline, 123, 'lookup must not modify the scanner budget');
  assert.equal(h.service._processingReading, true);
});

test('authoritative missing student never uses stale local data', async () => {
  const h = setup();
  h.cloud.students = null;
  const result = await h.service.getQueuePosition('0012');
  assert.equal(result.student, null);
  assert.equal(result.position, null);
  assert.equal(result.localOnly, false);
});

test('no gate entry yields no position', async () => {
  const h = setup();
  h.cloud.school_entries = [];
  assert.equal((await h.service.getQueuePosition('0012')).position, null);
});

test('offline consultation deduplicates arrivals and marks its result provisional', async () => {
  const h = setup(false);
  h.entries.push({ ...h.entries[1], id: 'duplicate' });
  const result = await h.service.getQueuePosition('0012');
  assert.equal(result.position, 2);
  assert.equal(result.localOnly, true);
  assert.equal(h.calls.length, 0);
});

test('hanging network is bounded and falls back without changing the scanner lock', async () => {
  const h = setup();
  h.window.supabaseClient.from = () => {
    const q = { select() { return q; }, eq() { return q; }, order() { return q; }, maybeSingle() { return q; }, then() {} };
    return q;
  };
  const start = Date.now();
  const result = await h.service.getQueuePosition('0012');
  assert.equal(result.localOnly, true);
  assert.equal(result.position, 2);
  assert.ok(Date.now() - start < 2600);
});

test('form shows position separately using textContent, without recording an attendance', async () => {
  const h = setup(false);
  await h.context.handlePositionLookup({ preventDefault() {} });
  const text = h.nodes['position-lookup-result'].textContent;
  assert.match(text, /<Aluno>/);
  assert.match(text, /2º lugar/);
  assert.match(text, /Dados deste aparelho/);
  assert.equal(h.nodes['btn-position-lookup'].disabled, false);
});

test('form discards a late response if the registration changed', async () => {
  const h = setup();
  let finish;
  h.service.getQueuePosition = () => new Promise(resolve => { finish = resolve; });
  const pending = h.context.handlePositionLookup({ preventDefault() {} });
  h.nodes['input-position-registration'].value = 'another';
  finish({ student: h.cloud.students, position: 2, localOnly: false });
  await pending;
  assert.doesNotMatch(h.nodes['position-lookup-result'].textContent, /2º lugar/);
  assert.equal(h.nodes['btn-position-lookup'].disabled, false);
});
