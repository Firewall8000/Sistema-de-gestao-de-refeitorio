const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const records = { school_entries: [], meal_logs: [], students: [], offline_meta: [] };
  const cloud = { school_entries: [], meal_logs: [], students: [] };
  const writes = [], calls = [];
  const node = () => ({ disabled: false, textContent: '', hidden: false, children: [],
    setAttribute() {}, replaceChildren() { this.children = []; }, appendChild(n) { this.children.push(n); },
    classList: { classes: new Set(), toggle(name, on) { if (on) this.classes.add(name); else this.classes.delete(name); }, add(name) { this.classes.add(name); } } });
  const nodes = Object.fromEntries(['btn-sync-check', 'sync-device-status', 'sync-device-issues', 'sync-device-issue-list'].map(id => [id, node()]));
  const window = {
    dbEngine: {
      discardExpiredPending: async () => {},
      getAll: async t => records[t].map(row => ({ ...row })),
      get: async (t, id) => records[t].find(row => row.id === id),
      put: async (t, row) => { const i = records[t].findIndex(r => r.id === row.id); if (i < 0) records[t].push(row); else records[t][i] = row; },
      saveOfflineSnapshot: async s => { writes.push(s); }
    },
    supabaseClient: { from(table) {
      const filters = [];
      let start = 0, end = 499;
      const q = { select() { return q; }, eq(k,v) { filters.push([k,v]); return q; }, order() { return q; },
        range(a,b) { start=a; end=b; return q; },
        then(resolve,reject) {
          calls.push({table,start,end});
          return Promise.resolve({ data: cloud[table].filter(row => filters.every(([k,v]) => row[k] === v)).slice(start,end+1), error:null }).then(resolve,reject);
        } };
      return q;
    } },
    studentService: { _mapFromSupabase: rows => rows }
  };
  const context = { window, document: { getElementById: id => nodes[id], createElement: node },
    navigator: { onLine:true }, console, setTimeout, clearTimeout, AbortController };
  vm.createContext(context);
  for (const name of ['mealService.js','sync.js','syncControls.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name),'utf8'),context);
  }
  window.mealValidatorService.getTodayDateString = () => '2026-11-05';
  return { window, context, controls:window.syncControls, records, cloud, nodes, writes, calls };
}
const entry = (extra = {}) => ({ id:'e1',student_id:'s1',student_name:'Aluno',entry_date:'2026-11-05',entry_time:'2026-11-05T10:00:00Z',synced:false,...extra });

test('daily status and verification exclude previous days', async () => {
  const h=setup();
  h.records.school_entries.push(entry({entry_date:'2026-11-04',synced:true}));
  h.records.meal_logs.push({id:'old',date:'2026-11-04',synced:false});
  assert.equal((await h.controls.localRecords()).length,0);
  await h.controls.verify(await h.controls.localRecords());
  assert.equal(h.calls.length,0);
  await h.controls.refreshStatus();
  assert.match(h.nodes['sync-device-status'].textContent,/Nenhum registro de hoje/);
  assert.equal(h.nodes['btn-sync-check'].classList.classes.has('sync-attention'),false);
});

test('midnight stops further sends without changing the original date', async () => {
  const h=setup(); let day='2026-11-05'; const sent=[];
  h.window.mealValidatorService.getTodayDateString=()=>day;
  h.records.school_entries.push(entry(),entry({id:'e2',student_id:'s2'}));
  h.window.supabaseClient={from:()=>({upsert:async row=>{
    sent.push(row);day='2026-11-06';return {error:null};
  }})};
  await h.window.syncEngine.syncPendingOfflineRecords();
  assert.equal(sent.length,1);
  assert.equal(sent[0].entry_date,'2026-11-05');
  assert.equal(h.records.school_entries[1].synced,false);
  assert.match(h.window.syncEngine.lastError,/O dia mudou/);
});

test('school date stays on the previous day before midnight in Fortaleza', () => {
  const window={};
  class FixedDate extends Date { constructor(...args) { super(...(args.length?args:['2026-11-07T01:00:00Z'])); } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/mealService.js'),'utf8'),{window,Date:FixedDate});
  assert.equal(window.mealValidatorService.getTodayDateString(),'2026-11-06');
});

test('one button changes offline label, disables downloads, and glows for pending records', async () => {
  const h = setup(); h.records.school_entries.push(entry());
  await h.controls.refreshStatus();
  assert.equal(h.nodes['btn-sync-check'].textContent,'Sincronizar e Conferir');
  assert.equal(h.nodes['btn-sync-check'].classList.classes.has('sync-attention'),true);
  assert.match(h.nodes['sync-device-status'].textContent,/1 pendente/);
  h.context.navigator.onLine=false;
  await h.controls.refreshStatus();
  assert.equal(h.nodes['btn-sync-check'].textContent,'Atualizar dados para uso offline');
  assert.equal(h.nodes['btn-sync-check'].disabled,true);
  await h.controls.run();
  assert.equal(h.calls.length,0);
});

test('successful upload alone is not shown as verified', async () => {
  const h=setup(); h.records.school_entries.push(entry({synced:true}));
  await h.controls.refreshStatus();
  assert.match(h.nodes['sync-device-status'].textContent,/1 aguardando conferência/);
  assert.equal(h.nodes['btn-sync-check'].classList.classes.has('sync-attention'),true);
});

test('matching server record confirms by student/date/time even when IDs differ', async () => {
  const h=setup(); h.records.school_entries.push(entry()); h.cloud.school_entries.push(entry({id:'server-id'}));
  assert.equal(await h.controls.verify(await h.controls.localRecords()),0);
  assert.equal(h.records.school_entries[0].synced,true);
  assert.ok(h.records.school_entries[0].verifiedAt);
  await h.controls.refreshStatus();
  assert.equal(h.nodes['btn-sync-check'].classList.classes.has('sync-attention'),false);
});

test('different timestamps and invisible server rows remain highlighted without overwriting times', async () => {
  const h=setup(); h.records.school_entries.push(entry());
  h.cloud.school_entries.push(entry({entry_time:'2026-11-05T10:10:00Z'}));
  assert.equal(await h.controls.verify(await h.controls.localRecords()),1);
  assert.equal(h.records.school_entries[0].entry_time,'2026-11-05T10:00:00Z');
  assert.match(h.records.school_entries[0].syncIssue,/Horário/);
  h.cloud.school_entries=[];
  assert.equal(await h.controls.verify(await h.controls.localRecords()),1);
  assert.match(h.records.school_entries[0].syncIssue,/permissão/);
  await h.controls.refreshStatus();
  assert.equal(h.nodes['sync-device-issues'].hidden,false);
});

test('meal status differences are not treated as successful verification', async () => {
  const h=setup();
  const item={table:'meal_logs',row:{studentRegistration:'R1',timestamp:'2026-11-05T10:00:00Z',validationMethod:'CAMERA'}};
  assert.match(h.controls.difference(item,{student_registration:'R1',timestamp:item.row.timestamp,validation_method:'AUSENTE'}),/Situação/);
});

test('download paginates more than 1000 students and avoids a partial snapshot on failure', async () => {
  const h=setup(); h.cloud.students=Array.from({length:1101},(_,i)=>({id:`s${i}`}));
  await h.controls.prepareOffline();
  assert.equal(h.writes[0].students.length,1101);
  assert.equal(h.calls.filter(c=>c.table==='students').length,3);
  h.writes.length=0;
  const fetch=h.controls.fetchAll.bind(h.controls);
  h.controls.fetchAll=(table,date)=>table==='meal_logs'?Promise.reject(new Error('network')):fetch(table,date);
  await assert.rejects(h.controls.prepareOffline(),/network/);
  assert.equal(h.writes.length,0);
});

test('a date change during download prevents preparing a mixed-day snapshot', async () => {
  const h=setup(); let day='2026-11-05';
  h.window.mealValidatorService.getTodayDateString=()=>day;
  h.controls.fetchAll=async()=>{ day='2026-11-06';return []; };
  await assert.rejects(h.controls.prepareOffline(),/dia mudou/);
  assert.equal(h.writes.length,0);
});

test('manual run does not overlap upload and reports a failed download without success', async () => {
  const h=setup(); h.window.syncEngine.syncing=true;
  await h.controls.run(); assert.equal(h.calls.length,0);
  h.window.syncEngine.syncing=false;
  h.window.syncEngine.syncPendingOfflineRecords=async()=>{};
  h.controls.prepareOffline=async()=>{throw new Error('network');};
  await h.controls.run();
  assert.equal(h.controls.busy,false);
  assert.match(h.nodes['sync-device-status'].textContent,/Não foi possível concluir/);
});

test('local changes during verification are not overwritten by an older response', async () => {
  const h=setup();h.records.school_entries.push(entry());h.cloud.school_entries.push(entry());
  const old=await h.controls.localRecords();
  h.records.school_entries[0].entry_time='2026-11-05T11:00:00Z';
  await h.controls.verify(old);
  assert.equal(h.records.school_entries[0].verifiedAt,undefined);
  assert.equal(h.records.school_entries[0].entry_time,'2026-11-05T11:00:00Z');
});

test('network timeout releases the sync request and cannot mark it confirmed', async () => {
  const h=setup();
  await assert.rejects(h.window.syncEngine.withTimeout(new Promise(()=>{}),20),/Sem resposta/);
});

test('connected Wi-Fi without server access switches to disabled offline control and recovers automatically', async () => {
  const h=setup();
  h.window.supabaseClient.from=()=>({select(){return this;},limit(){return Promise.reject(new Error('network'));}});
  await h.controls.checkConnection();
  assert.equal(h.nodes['btn-sync-check'].textContent,'Atualizar dados para uso offline');
  assert.equal(h.nodes['btn-sync-check'].disabled,true);
  h.window.supabaseClient.from=()=>({select(){return this;},limit(){return Promise.resolve({data:[],status:200});}});
  await h.controls.checkConnection();
  assert.equal(h.nodes['btn-sync-check'].textContent,'Sincronizar e Conferir');
  assert.equal(h.nodes['btn-sync-check'].disabled,false);
});

test('automatic upload immediately explains disabled button, reports progress, and releases it on failure', async () => {
  const h=setup();
  h.records.school_entries.push(entry());
  let finish;
  h.window.supabaseClient.from=()=>({upsert:()=>new Promise(resolve=>{finish=resolve;})});
  const upload=h.window.syncEngine.syncPendingOfflineRecords();
  assert.equal(h.nodes['btn-sync-check'].textContent,'Enviando registros automaticamente…');
  assert.equal(h.nodes['btn-sync-check'].disabled,true);
  while(!finish) await Promise.resolve();
  await h.controls.refreshStatus();
  assert.match(h.nodes['sync-device-status'].textContent,/Entradas enviadas: 0 de 1/);
  finish({error:{message:'network'}});
  await upload;
  await h.controls.refreshStatus();
  assert.equal(h.nodes['btn-sync-check'].textContent,'Sincronizar e Conferir');
  assert.equal(h.nodes['btn-sync-check'].disabled,false);
  assert.match(h.nodes['sync-device-status'].textContent,/não confirmou/);
  assert.equal(h.records.school_entries[0].synced,false);
});

test('manual upload failure stops verification/preparation and releases busy state', async () => {
  const h=setup();h.records.school_entries.push(entry());
  h.window.supabaseClient.from=()=>({upsert:async()=>({error:{message:'denied'}})});
  let verified=false;
  h.controls.verify=async()=>{verified=true;};
  await h.controls.run();
  assert.equal(verified,false);
  assert.equal(h.writes.length,0);
  assert.equal(h.controls.busy,false);
  assert.equal(h.window.syncEngine.syncing,false);
  assert.equal(h.nodes['btn-sync-check'].disabled,false);
  assert.match(h.nodes['sync-device-status'].textContent,/Não foi possível concluir/);
});

test('shared upload budget stops the batch and keeps remaining records for retry', async () => {
  const h=setup();
  h.records.school_entries.push(entry(),entry({id:'e2',student_id:'s2'}));
  let uploads=0;
  h.window.supabaseClient.from=()=>({upsert(){
    const query={then(resolve,reject){
      uploads++;
      h.window.syncEngine.deadline=Date.now()-1;
      return Promise.resolve({error:null}).then(resolve,reject);
    }};return query;
  }});
  await h.window.syncEngine.syncPendingOfflineRecords();
  assert.equal(uploads,1);
  assert.equal(h.records.school_entries[0].synced,true);
  assert.equal(h.records.school_entries[1].synced,false);
  assert.equal(h.window.syncEngine.syncing,false);
  assert.match(h.window.syncEngine.lastError,/tempo desta tentativa/);
});
