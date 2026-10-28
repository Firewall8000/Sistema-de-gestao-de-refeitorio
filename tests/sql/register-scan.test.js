// PostgreSQL WASM integration, isolated from production. See LEITURA-RAPIDA.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

test('RPC runs against the current schema with caller RLS and unique constraints', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE denied;');
  // pgvector/realtime are unrelated to this function and unavailable in PGlite.
  const schema = fs.readFileSync(path.join(__dirname, '../../sql/schema.sql'), 'utf8')
    .replace(/^CREATE EXTENSION IF NOT EXISTS vector;.*$/m, '')
    .replace(/^.*face_embedding vector\(128\).*$/m, '')
    .replace(/^ALTER PUBLICATION.*$/gm, '');
  await db.exec(schema);
  await db.exec('GRANT USAGE ON SCHEMA public TO anon, authenticated, denied; GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO anon, authenticated;');
  const migration = fs.readFileSync(path.join(__dirname, '../../sql/migrations/06_register_scan.sql'), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // Safe to apply again.
  await db.exec(`INSERT INTO public.students(id, name, registration, grade, turma, qr_token, active) VALUES
    ('s1','Aluno 1','R1','1','A','QR1',true), ('s2','Aluno 2','R2','1','A','QR2',true),
    ('s3','Aluno 3','R3','1','A','QR3',true), ('inactive','Inativo','R4','1','A','QR4',false);`);
  async function scan(identifier, mode, request, method = 'qr_code') {
    const { rows } = await db.query('SELECT public.register_scan_rpc($1,$2,$3,$4) AS result', [identifier, mode, method, request]);
    return rows[0].result;
  }

  await t.test('invalid, inactive and missing students are never inserted', async () => {
    assert.equal((await scan('QR1', 'bad-mode', 'bad')).status, 'INVALID_INPUT');
    assert.equal((await scan('QR4', 'portaria', 'inactive')).status, 'INACTIVE');
    assert.equal((await scan('missing', 'portaria', 'missing')).status, 'NOT_FOUND');
  });

  await db.exec('SET ROLE anon');
  await t.test('RLS hides inactive students even when the RPC is called directly', async () => {
    assert.equal((await scan('QR4', 'portaria', 'hidden')).status, 'NOT_FOUND');
  });
  await t.test('meal without gate entry is rejected', async () => {
    assert.equal((await scan('QR1', 'refeitorio', 'no-entry')).status, 'NO_GATE_ENTRY');
  });
  await t.test('gate entry, retry idempotency and daily duplicate', async () => {
    const first = await scan('QR1', 'portaria', 'entry1');
    assert.equal(first.status, 'GRANTED');
    assert.equal(first.position, 1);
    assert.equal(first.record.id, 'entry1');
    assert.equal(first.record.entry_date, first.server_date);
    assert.equal((await scan('QR1', 'portaria', 'entry1')).status, 'GRANTED');
    assert.equal((await scan('QR1', 'portaria', 'other-entry')).status, 'ALREADY_GRANTED');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.school_entries')).rows[0].n, 1);
  });
  await t.test('manual check-in and out-of-order meal in one call', async () => {
    assert.equal((await scan('R2', 'portaria', 'entry2', 'manual')).position, 2);
    const meal = await scan('QR2', 'refeitorio', 'meal2');
    assert.equal(meal.status, 'GRANTED');
    assert.equal(meal.position, 2);
    assert.equal(meal.cutting_line, true);
    assert.equal(meal.next_position, 1);
    assert.equal(meal.record.student_registration, 'R2');
    assert.equal(meal.record.synced, true);
    assert.equal((await scan('QR2', 'refeitorio', 'meal2')).status, 'GRANTED');
    assert.equal((await scan('QR2', 'refeitorio', 'other-meal')).status, 'ALREADY_GRANTED');
  });
  await t.test('absence remains blocked and lets the queue advance', async () => {
    const entry = await scan('QR3', 'portaria', 'entry3');
    await db.query(`INSERT INTO public.meal_logs
      (id, student_id, student_registration, student_name, turma, grade, date, qr_token_used, validation_method)
      VALUES ('absent1','s1','R1','Aluno 1','A','1',$1,'QR1','AUSENTE')`, [entry.server_date]);
    assert.equal((await scan('QR1', 'refeitorio', 'absent-read')).status, 'ABSENT');
    const meal = await scan('QR3', 'refeitorio', 'meal3');
    assert.equal(meal.status, 'GRANTED');
    assert.equal(meal.cutting_line, false);
  });
  await db.exec('RESET ROLE; GRANT EXECUTE ON FUNCTION public.register_scan_rpc(TEXT,TEXT,TEXT,TEXT) TO denied; SET ROLE denied;');
  await t.test('execute permission cannot bypass table permissions', async () => {
    await assert.rejects(scan('QR1', 'portaria', 'denied'), /permission denied/i);
  });
});
