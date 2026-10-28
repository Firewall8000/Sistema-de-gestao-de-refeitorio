const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(mode = 'portaria') {
  const student = { id: 's1', name: 'Aluno', registration: 'R1', grade: '1', turma: 'A', active: true, qr_token: 'QR1' };
  const entry = { id: 'entry1', student_id: 's1', entry_date: '2026-10-28', entry_time: '2026-10-28T10:00:00Z' };
  const meal = { id: 'meal1', student_id: 's1', student_registration: 'R1', timestamp: '2026-10-28T15:00:00Z', date: '2026-10-28' };
  const writes = [], requests = [], banners = [], legacy = [];
  const window = {
    dbEngine: {
      get: async () => ({ photo_url: 'photo', boundDeviceId: 'device' }),
      put: async (table, row) => { writes.push({ table, row }); }
    },
    supabaseClient: {
      rpc(name, args) {
        requests.push({ name, args });
        return Promise.resolve({ data: { status: 'GRANTED', student, entry,
          record: mode === 'portaria' ? entry : meal, position: 2,
          cutting_line: mode === 'refeitorio', next_position: 1 }, error: null });
      },
      from() { throw new Error('Single-call path must not query tables separately'); }
    }
  };
  const context = { window, navigator: { onLine: true }, document: { getElementById: () => ({}) },
    console, setTimeout, clearTimeout, AbortController };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/mealService.js'), 'utf8'), context);
  const m = window.mealValidatorService;
  m.getScannerMode = () => mode;
  m.displayValidationResult = b => banners.push(b);
  m.refreshAfterReading = () => {};
  m.recordPortariaEntry = async () => { legacy.push(m._readingId); return 'legacy'; };
  m.recordRefeitorioMeal = m.recordPortariaEntry;
  return { m, window, context, requests, writes, banners, legacy };
}

test('one RPC confirms portaria and caches the server timestamp without another HTTP request', async () => {
  const h = setup();
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: ' QR1 ' }), true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].name, 'register_scan_rpc');
  assert.equal(h.requests[0].args.p_identifier, 'QR1');
  assert.equal(h.requests[0].args.p_mode, 'portaria');
  assert.equal(h.legacy.length, 0);
  assert.equal(h.writes[0].row.photo_url, 'photo');
  assert.equal(h.writes[0].row.boundDeviceId, 'device');
  assert.equal(h.writes[1].row.synced, true);
  assert.equal(h.writes[1].row.entry_time, '2026-10-28T10:00:00Z');
  assert.match(h.banners[0].title, /ENTRADA REGISTRADA/);
});

test('meal RPC handles manual registration and returns the out-of-order warning', async () => {
  const h = setup('refeitorio');
  const result = await h.m.validateAndRecordMeal({ registration: ' R1 ' });
  assert.equal(result.success, true);
  assert.equal(result.cuttingLine, true);
  assert.equal(h.requests[0].args.p_method, 'manual');
  assert.equal(h.banners[0].warning, true);
  const meal = h.writes.find(w => w.table === 'meal_logs').row;
  assert.equal(meal.studentId, 's1');
  assert.equal(meal.studentRegistration, 'R1');
  assert.equal(meal.synced, true);
});

test('server denials and permission errors never fall back to local approval', async () => {
  for (const status of ['NOT_FOUND', 'INACTIVE', 'NO_GATE_ENTRY', 'ABSENT', 'ALREADY_GRANTED', 'INVALID_INPUT', 'UNKNOWN']) {
    const h = setup();
    h.window.supabaseClient.rpc = async () => ({ data: { status } });
    assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'QR1' }), false, status);
    assert.equal(h.legacy.length, 0, status);
    assert.equal(h.banners[0].success, false, status);
  }
  const h = setup();
  h.window.supabaseClient.rpc = async () => ({ error: { code: '42501' }, status: 403 });
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'QR1' }), false);
  assert.equal(h.legacy.length, 0);
});

test('missing migration falls back once and stops probing until reload', async () => {
  const h = setup();
  let calls = 0;
  h.window.supabaseClient.rpc = async () => { calls++; return { error: { code: 'PGRST202' } }; };
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'QR1' }), 'legacy');
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'QR2' }), 'legacy');
  assert.equal(calls, 1);
});

test('lost RPC response retains its ID and disables further online writes for that reading', async () => {
  const h = setup();
  let sentId;
  h.window.supabaseClient.rpc = async (_, args) => { sentId = args.p_request_id; throw new Error('network'); };
  h.m.recordPortariaEntry = async () => {
    assert.equal(h.m._readingId, sentId);
    assert.ok(h.m._readingDeadline < Date.now());
    assert.equal(h.m._usingLocal, true);
    return true;
  };
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'QR1' }), true);
  assert.ok(sentId);
});

test('local storage failure after confirmed RPC does not invalidate remote success', async () => {
  const h = setup();
  h.window.dbEngine.put = async () => { throw new Error('quota'); };
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'QR1' }), true);
  assert.match(h.banners[0].sub, /cópia deste aparelho/);
  assert.equal(h.legacy.length, 0);
});

test('offline reading never attempts RPC', async () => {
  const h = setup();
  h.context.navigator.onLine = false;
  assert.equal(await h.m.validateAndRecordMeal({ qrToken: 'QR1' }), 'legacy');
  assert.equal(h.requests.length, 0);
});

test('a conflicting entry cache does not prevent caching the confirmed meal', async () => {
  const h = setup('refeitorio');
  const put = h.window.dbEngine.put;
  h.window.dbEngine.put = async (table, row) => {
    if (table === 'school_entries') throw new Error('ConstraintError');
    return put(table, row);
  };
  assert.equal((await h.m.validateAndRecordMeal({ qrToken: 'QR1' })).success, true);
  assert.equal(h.writes.find(w => w.table === 'meal_logs').row.synced, true);
});
