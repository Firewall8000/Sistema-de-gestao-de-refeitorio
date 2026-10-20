const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/queuePrint.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function setup({ admin = true, online = true, blocked = false } = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      innerHTML: '', textContent: '', disabled: false, value: 'all',
      classList: { add() {}, remove() {} }, addEventListener() {}
    });
    return nodes.get(id);
  };
  const calls = { entries: 0, students: 0, popup: 0 };
  const entries = [
    { student_id: 'a', student_name: 'Antigo A' },
    { student_id: 'b', student_name: 'Antigo B' },
    { student_id: 'c', student_name: 'Antigo C' },
    { student_id: 'd', student_name: 'Antigo D' }
  ];
  const students = [
    { id: 'a', name: 'Atual A', grade: '1º Ano', turma: 'A' },
    { id: 'b', name: 'Atual B', grade: '2º Ano', turma: 'B' },
    { id: 'c', name: 'Atual C', grade: '1º Ano', turma: 'A' },
    { id: 'd', name: 'Atual D', grade: '2º Ano', turma: 'B' }
  ];
  const window = {
    authManager: { isAdmin: () => admin },
    studentService: {
      getDisplayName: (e, s) => s?.name || e?.student_name || 'Aluno',
      async getAllStudents() { calls.students++; return students; }
    },
    mealValidatorService: {
      getTodayDateString: () => '2026-10-20',
      async getTodayOrderedEntries() { calls.entries++; return entries; }
    },
    open() {
      calls.popup++;
      return blocked ? null : {
        document: { open() {}, write(html) { calls.html = html; }, close() {} },
        focus() {}
      };
    }
  };
  vm.runInNewContext(source, { window, document: { getElementById: node, addEventListener() {} }, navigator: { onLine: online } });
  return { controller: window.queuePrintController, window, node, calls, entries, students };
}

test('assigns general positions before grouping and never mutates source records', () => {
  const h = setup();
  const before = clone([h.entries, h.students]);
  const s = h.controller.buildSnapshot(h.entries, h.students, '2026-10-20', new Date(), false);
  assert.deepEqual(clone(s.groups.map(g => g.rows.map(r => r.position))), [[1, 3], [2, 4]]);
  assert.equal(s.groups[0].rows[1].name, 'Atual C');
  assert.deepEqual(clone([h.entries, h.students]), before);
});

test('same turma letter in different grades stays in separate sheets', () => {
  const h = setup();
  h.students[1].turma = 'A';
  const s = h.controller.buildSnapshot(h.entries, h.students, '2026-10-20', new Date(), false);
  assert.equal(s.groups.length, 3);
});

test('snapshot stays fixed when source name or arrival list changes', async () => {
  const h = setup();
  await h.controller.open();
  h.students[0].name = 'Nome alterado depois';
  h.entries.push({ student_id: 'e', student_name: 'Chegada nova' });
  h.controller.preview();
  assert.equal(h.calls.entries, 1);
  assert.equal(h.calls.students, 1);
  assert.ok(h.calls.html.includes('Atual A'));
  assert.ok(!h.calls.html.includes('Nome alterado depois'));
  assert.ok(!h.calls.html.includes('Chegada nova'));
});

test('one-class print keeps gaps in general positions', async () => {
  const h = setup();
  await h.controller.open();
  h.node('queue-print-class').value = '1';
  h.controller.preview();
  assert.ok(h.calls.html.includes('<td>2º</td>'));
  assert.ok(h.calls.html.includes('<td>4º</td>'));
  assert.ok(!h.calls.html.includes('<td>1º</td>'));
  assert.ok(!h.calls.html.includes('Atual A'));
  assert.equal((h.calls.html.match(/<section class="sheet">/g) || []).length, 1);
});

test('all-class print has page breaks, repeated headings, A4, date and waiting notice', async () => {
  const h = setup();
  await h.controller.open();
  const html = h.controller.renderDocument(h.controller.snapshot);
  assert.equal((html.match(/<section class="sheet">/g) || []).length, 2);
  assert.match(html, /size: A4 portrait/);
  assert.match(html, /table-header-group/);
  assert.match(html, /break-before: page/);
  assert.match(html, /20\/10\/2026/);
  assert.match(html, /Aguarde a chamada da equipe/);
});

test('no meal lookup or exclusion: students already served retain their positions', async () => {
  const h = setup();
  h.window.mealValidatorService._fetchTodayMealsRaw = () => { throw new Error('Must not read/filter meals'); };
  await h.controller.open();
  assert.equal(h.controller.snapshot.total, 4);
  assert.equal(h.calls.entries, 1);
});

test('unavailable student is kept with historical name and fallback class', () => {
  const h = setup();
  const s = h.controller.buildSnapshot(h.entries, [], '2026-10-20', new Date(), false);
  assert.equal(s.total, 4);
  assert.equal(s.groups[0].grade, 'Série não informada');
  assert.equal(s.groups[0].rows[0].name, 'Antigo A');
});

test('student and class text cannot inject HTML', () => {
  const h = setup();
  h.students[0].name = '</td><script>alert(1)</script>';
  h.students[0].turma = '<img src=x onerror=alert(1)>';
  const s = h.controller.buildSnapshot(h.entries, h.students, '2026-10-20', new Date(), false);
  const html = h.controller.renderDocument(s);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('operator cannot prepare or open print preview', async () => {
  const h = setup({ admin: false });
  await h.controller.open();
  h.controller.preview();
  assert.equal(h.calls.entries, 0);
  assert.equal(h.calls.popup, 0);
});

test('empty arrivals disable printing', async () => {
  const h = setup();
  h.entries.length = 0;
  await h.controller.open();
  h.controller.preview();
  assert.equal(h.node('btn-preview-queue-print').disabled, true);
  assert.equal(h.calls.popup, 0);
  assert.match(h.node('queue-print-status').textContent, /Nenhuma chegada/);
});

test('offline print warns about potentially incomplete local data', async () => {
  const h = setup({ online: false });
  await h.controller.open();
  assert.match(h.node('queue-print-status').textContent, /Sem conexão/);
  assert.match(h.controller.renderDocument(h.controller.snapshot), /Gerada sem conexão/);
});

test('blocked popup reports how to retry without fetching another snapshot', async () => {
  const h = setup({ blocked: true });
  await h.controller.open();
  h.controller.preview();
  assert.match(h.node('queue-print-status').textContent, /pop-ups/);
  assert.equal(h.calls.entries, 1);
});

test('closing while loading discards the late response', async () => {
  const h = setup();
  let release;
  h.window.mealValidatorService.getTodayOrderedEntries = () => new Promise(resolve => { release = resolve; });
  const pending = h.controller.open();
  h.controller.close();
  release(h.entries);
  await pending;
  assert.equal(h.controller.snapshot, null);
  assert.equal(h.node('btn-preview-queue-print').disabled, true);
});

test('a midnight boundary rejects mixed-day snapshot', async () => {
  const h = setup();
  let calls = 0;
  h.window.mealValidatorService.getTodayDateString = () => ++calls === 1 ? '2026-10-20' : '2026-10-21';
  await h.controller.open();
  assert.equal(h.controller.snapshot, null);
  assert.match(h.node('queue-print-status').textContent, /dia mudou/);
});
