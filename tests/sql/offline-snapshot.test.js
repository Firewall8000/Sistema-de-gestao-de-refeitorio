// Run with FAKE_INDEXEDDB_MODULE pointing at an isolated fake-indexeddb install.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory } = require(process.env.FAKE_INDEXEDDB_MODULE || 'fake-indexeddb');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('offline cleanup removes only expired pending rows, then uploads today with original time', async t => {
  const window={};
  const context={window,indexedDB:new IDBFactory(),console,setTimeout,clearTimeout,
    navigator:{onLine:false}};
  vm.createContext(context);
  for(const file of ['db.js','mealService.js','sync.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../../js',file),'utf8'),context);
  }
  const db=window.dbEngine; await db.init(); t.after(()=>db.db.close());
  window.mealValidatorService.getTodayDateString=()=> '2026-11-06';
  await db.put('students',{id:'student',registration:'R1',qrToken:'QR1'});
  for(const [table,dateKey] of [['school_entries','entry_date'],['meal_logs','date']]) {
    for(const [id,date,synced] of [['old','2026-11-05',false],['today','2026-11-06',false],
      ['history','2026-11-05',true],['future','2026-11-07',false],['invalid','2026-02-30',false]]) {
      await db.put(table,{id,[dateKey]:date,synced,student_id:id,studentId:id,
        entry_time:'2026-11-06T10:03:22Z',timestamp:'2026-11-06T10:03:22Z'});
    }
  }
  await window.syncEngine.syncPendingOfflineRecords();
  for(const table of ['school_entries','meal_logs']) {
    assert.deepEqual((await db.getAll(table)).map(r=>r.id).sort(),['future','history','invalid','today']);
  }
  assert.ok(await db.get('students','student'));
  const meta=await db.get('offline_meta','pending_cleanup');
  assert.equal(meta.entries,1); assert.equal(meta.meals,1);
  await window.syncEngine.syncPendingOfflineRecords();
  assert.equal((await db.get('offline_meta','pending_cleanup')).entries,1);
  const uploads=[];
  window.supabaseClient={from:table=>({upsert:async row=>{uploads.push({table,row});return {error:null};}})};
  context.navigator.onLine=true;
  await window.syncEngine.syncPendingOfflineRecords();
  assert.equal(uploads.length,2);
  for(const {row} of uploads) {
    assert.equal(row.entry_date||row.date,'2026-11-06');
    assert.equal(row.entry_time||row.timestamp,'2026-11-06T10:03:22Z');
  }
});

test('offline preparation commits atomically and preserves pending records and historical dates', async t => {
  const window={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../js/db.js'),'utf8'),{window,indexedDB:new IDBFactory(),console});
  const db=window.dbEngine;await db.init();t.after(()=>db.db.close());
  await db.put('students',{id:'old',registration:'OLD',qrToken:'OLD'});
  await db.put('school_entries',{id:'pending',student_id:'s1',entry_date:'2026-11-05',synced:false});
  await db.put('school_entries',{id:'previous',student_id:'s1',entry_date:'2026-11-04',synced:true});
  await db.put('school_entries',{id:'conflict',student_id:'s2',entry_date:'2026-11-05',synced:true,syncIssue:'Horário diferente'});
  await db.put('school_entries',{id:'new-reading',student_id:'s4',entry_date:'2026-11-05',synced:true});
  const snapshot={date:'2026-11-05',preparedAt:'2026-11-05T11:00:00Z',
    students:[{id:'new',registration:'NEW',qrToken:'NEW'}],
    entries:[{id:'remote1',student_id:'s1',entry_date:'2026-11-05',synced:true},
      {id:'remote2',student_id:'s2',entry_date:'2026-11-05',synced:true},
      {id:'remote3',student_id:'s3',entry_date:'2026-11-05',synced:true}],meals:[]};
  await db.saveOfflineSnapshot(snapshot);
  assert.deepEqual((await db.getAll('school_entries')).map(r=>r.id).sort(),['conflict','new-reading','pending','previous','remote3']);
  assert.equal(await db.get('students','old'),null);
  assert.equal((await db.get('offline_meta','snapshot')).entries,3);
  await assert.rejects(db.saveOfflineSnapshot({...snapshot,preparedAt:'bad',students:[
    {id:'a',registration:'DUP',qrToken:'a'},{id:'b',registration:'DUP',qrToken:'b'}]}));
  assert.ok(await db.get('students','new'),'old cache must survive an aborted replacement');
  assert.equal((await db.get('offline_meta','snapshot')).preparedAt,snapshot.preparedAt);
});

test('download -> offline meal -> duplicate block -> upload -> server verification', async t => {
  const window={};
  const context={window,indexedDB:new IDBFactory(),console,setTimeout,clearTimeout,AbortController,
    navigator:{onLine:true},document:{getElementById:()=>null}};
  vm.createContext(context);
  for(const file of ['db.js','studentService.js','mealService.js','sync.js','syncControls.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../../js',file),'utf8'),context);
  }
  const db=window.dbEngine;await db.init();t.after(()=>db.db.close());
  const day='2026-11-05';
  const cloud={students:[{id:'s1',name:'Aluno',registration:'R1',qr_token:'QR1',grade:'1',turma:'A',active:true}],
    school_entries:[{id:'e1',student_id:'s1',student_name:'Aluno',turma:'A',entry_date:day,entry_time:day+'T10:00:00Z',entry_method:'qr_code'}],meal_logs:[]};
  window.supabaseClient={from(table){
    let row, filters=[],offset=0,end=499;
    const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},
      range(a,b){offset=a;end=b;return q;},upsert(value){row=value;return q;},
      then(resolve,reject){
        if(row&&!cloud[table].some(r=>r.student_id===row.student_id&&(r.date||r.entry_date)===(row.date||row.entry_date))) cloud[table].push({...row});
        return Promise.resolve({data:cloud[table].filter(r=>filters.every(([k,v])=>r[k]===v)).slice(offset,end+1),error:null}).then(resolve,reject);
      }};return q;
  }};
  const service=window.mealValidatorService;
  service.getTodayDateString=()=>day;service.getScannerMode=()=> 'refeitorio';
  service.refreshAfterReading=()=>{};service.displayValidationResult=()=>{};
  await window.syncControls.run();
  assert.equal((await db.getAll('school_entries')).length,1);
  assert.ok(await db.get('offline_meta','snapshot'));
  context.navigator.onLine=false;
  assert.equal(await service.validateAndRecordMeal({qrToken:'QR1'}),true);
  assert.equal(await service.validateAndRecordMeal({qrToken:'QR1'}),false);
  const local=(await db.getAll('meal_logs'))[0];
  assert.equal(local.synced,false);
  assert.equal(cloud.meal_logs.length,0);
  context.navigator.onLine=true;
  await window.syncControls.run();
  assert.equal(cloud.meal_logs.length,1);
  assert.equal(cloud.meal_logs[0].timestamp,local.timestamp);
  assert.equal((await db.getAll('meal_logs'))[0].synced,true);
  assert.ok((await db.getAll('meal_logs'))[0].verifiedAt);
  assert.equal((await db.getAll('meal_logs'))[0].syncIssue,undefined);
});

test('version 2 database upgrades without losing existing student records', async t => {
  const indexedDB=new IDBFactory();
  await new Promise((resolve,reject)=>{
    const req=indexedDB.open('SantosDumontRefectoryDB',2);
    req.onupgradeneeded=()=>{
      const s=req.result.createObjectStore('students',{keyPath:'id'});
      s.createIndex('registration','registration',{unique:true});s.createIndex('qrToken','qrToken',{unique:true});
      s.put({id:'existing',registration:'R1',qrToken:'QR1'});
    };
    req.onsuccess=()=>{req.result.close();resolve();};req.onerror=()=>reject(req.error);
  });
  const window={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../js/db.js'),'utf8'),{window,indexedDB,console});
  await window.dbEngine.init();t.after(()=>window.dbEngine.db.close());
  assert.ok(await window.dbEngine.get('students','existing'));
  assert.ok(window.dbEngine.db.objectStoreNames.contains('offline_meta'));
});
