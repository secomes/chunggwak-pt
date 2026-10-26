import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.mjs';

async function fixture(t, plugins=[]) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cgpt-test-'));
  const app=await createApp({port:0,publicUrl:'http://127.0.0.1:0',dataDir:dir,noOwner:true,noScheduler:true,plugins});await app.listen();
  t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});
  async function request(route, { method='GET', data, user, token, origin, csrf=true }={}) {
    const r=await fetch(app.cfg.publicUrl+'/api'+route,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(user?{Cookie:user.cookie,...(csrf?{'X-CSRF-Token':user.csrf}:{})}:{}),...(token?{Authorization:`Bearer ${token}`} :{}),...(origin?{Origin:origin}:{})},body:data?JSON.stringify(data):undefined,redirect:'manual'});
    const body=await r.json();return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }
  async function register(name) {const r=await request('/auth/register',{method:'POST',data:{email:`${name}@example.com`,name,password:'a-secure-password-123'}});assert.equal(r.status,201);return {...r.body,cookie:r.cookie};}
  return {app,request,register};
}
test('다중 사용자 일정·연결·개인 메모·API 키는 계정 밖으로 나가지 않는다',async t=>{
  const {request,register}=await fixture(t),a=await register('alice'),b=await register('bob');
  const task=await request('/tasks',{method:'POST',user:a,data:{title:'Alice private task',dueAt:'2099-10-28',summary:'내 일정'}});assert.equal(task.status,201);
  assert.equal((await request('/tasks?view=all',{user:b})).body.items.length,0);
  assert.equal((await request(`/tasks/${task.body.id}`,{method:'PATCH',user:b,data:{progress:'done'}})).status,404);
  const c=await request('/connections',{method:'POST',user:a,data:{provider:'webhook',name:'private input'}});assert.equal(c.status,201);
  assert.equal((await request(`/connections/${c.body.connection.id}`,{method:'PATCH',user:b,data:{enabled:false}})).status,404);
  const readKey=await request('/keys',{method:'POST',user:a,data:{name:'read only',scopes:['tasks:read']}});
  assert.equal((await request('/tasks?view=all',{token:readKey.body.token})).body.items.length,1);
  assert.equal((await request('/tasks',{method:'POST',token:readKey.body.token,data:{title:'forbidden'}})).status,403);
  assert.equal((await request('/connections',{token:readKey.body.token})).status,403);
  assert.equal((await request('/keys',{user:b})).body.items.length,0);
  assert.equal((await request('/tasks',{user:a})).body.items[0].title,'Alice private task');
});
test('브라우저 쓰기는 CSRF와 Origin을 검증하고 API 데이터에 토큰을 포함하지 않는다',async t=>{
  const {request,register}=await fixture(t),u=await register('csrf');
  assert.equal((await request('/tasks',{method:'POST',user:u,csrf:false,data:{title:'x'}})).status,403);
  assert.equal((await request('/tasks',{method:'POST',user:u,origin:'https://evil.example',data:{title:'x'}})).status,403);
  await request('/connections',{method:'POST',user:u,data:{provider:'custom-feed',config:{url:'https://example.com/feed'},apiToken:'TOP-SECRET'}});
  const connections=await request('/connections',{user:u});assert.ok(!JSON.stringify(connections.body).includes('TOP-SECRET'));
  assert.equal((await request('/admin/oauth',{method:'POST',user:u,data:{}})).status,403);
});
test('수신 API는 키와 소유자 범위를 강제하고 같은 원본은 갱신한다',async t=>{
  const {request,register}=await fixture(t),a=await register('one'),b=await register('two');
  const c=await request('/connections',{method:'POST',user:a,data:{provider:'webhook',name:'Power Automate'}}),id=c.body.connection.id,key=c.body.ingest.token;
  const item={externalId:'id-1',courseId:'class-1',title:'반복 제목',dueAt:'2099-10-28',attachments:[{name:'양식.hwp'}]};
  assert.equal((await request(`/ingest/${id}`,{method:'POST',token:'wrong',data:{items:[item]}})).status,401);
  assert.equal((await request(`/ingest/${id}`,{method:'POST',token:key,data:{items:[item]}})).body.counts.created,1);
  assert.equal((await request(`/ingest/${id}`,{method:'POST',token:key,data:{items:[item]}})).body.counts.unchanged,1);
  assert.equal((await request(`/ingest/${id}`,{method:'POST',token:key,data:{items:[{...item,status:'submitted'}]}})).body.counts.updated,1);
  assert.equal((await request('/tasks',{user:a})).body.items.length,0);
  assert.equal((await request('/tasks?view=archive',{user:a})).body.items.length,1);
  assert.equal((await request('/tasks?view=all',{user:b})).body.items.length,0);
  const before=(await request('/tasks?view=all',{user:a})).body.items.length;
  assert.equal((await request(`/ingest/${id}`,{method:'POST',token:key,data:{items:[{...item,externalId:'new'},{title:'invalid'}]}})).status,400);
  assert.equal((await request('/tasks?view=all',{user:a})).body.items.length,before,'partial batches must be atomic');
});
test('연결 오류는 다른 사용자의 작업이나 기존 일정을 지우지 않는다',async t=>{
  const {app,request,register}=await fixture(t,[{id:'test-failure',pull:async()=>{throw Error('private token details');}}]),u=await register('failure');
  const c=app.store.connection(u.user.id,'test-failure','테스트');app.store.ingest(u.user.id,c,[{externalId:'keep',title:'보존할 일정'}]);
  await assert.rejects(app.scheduler.sync(c.id,u.user.id));
  const jobs=await request('/jobs',{user:u});assert.equal(jobs.body.jobs[0].status,'failed');assert.ok(!JSON.stringify(jobs.body).includes('private token details'));
  assert.equal((await request('/tasks?view=all',{user:u})).body.items.length,1);
});
test('OAuth state는 생성 사용자·서비스에 바인딩되어 타 계정 연결을 막는다',async t=>{
  const {app,request,register}=await fixture(t),a=await register('oauth-a'),b=await register('oauth-b');
  process.env.GOOGLE_CLIENT_ID='fake-client';process.env.GOOGLE_CLIENT_SECRET='fake-secret';
  const started=await request('/oauth/classroom/start',{method:'POST',user:a,data:{}});assert.equal(started.status,200);
  const s=new URL(started.body.url).searchParams.get('state');
  const wrong=await request(`/oauth/classroom/callback?state=${s}&code=not-a-real-code`,{user:b});assert.equal(wrong.status,400);
  assert.equal(app.store.all('SELECT * FROM oauth_states').length,1);
  delete process.env.GOOGLE_CLIENT_ID;delete process.env.GOOGLE_CLIENT_SECRET;
});
test('사용자별 백그라운드 스케줄러는 중복 실행을 막고 변경 건수를 기록한다',async t=>{
  let release;const gate=new Promise(r=>release=r);
  const {app,register}=await fixture(t,[{id:'test-source',pull:async()=>{await gate;return [{externalId:'one',title:'새 일정'}];}}]),u=await register('scheduler');
  const c=app.store.connection(u.user.id,'test-source','자동 테스트');
  const first=app.scheduler.sync(c.id,u.user.id);await assert.rejects(app.scheduler.sync(c.id,u.user.id),/이미 갱신/);release();const done=await first;assert.equal(done.counts.created,1);
  const again=await app.scheduler.sync(c.id,u.user.id);assert.equal(again.counts.unchanged,1);assert.equal(app.store.listTasks(u.user.id).length,1);
});
test('연결을 해제한 뒤 활성화해도 빈 수신 키로 쓸 수 없다',async t=>{
  const {request,register}=await fixture(t),u=await register('reconnect');
  const c=await request('/connections',{method:'POST',user:u,data:{provider:'webhook'}}),id=c.body.connection.id;
  await request(`/connections/${id}`,{method:'DELETE',user:u});await request(`/connections/${id}`,{method:'PATCH',user:u,data:{enabled:true}});
  assert.equal((await request(`/ingest/${id}`,{method:'POST',data:{items:[]}})).status,401);
});
test('확장 manifest는 서비스 추가 화면과 사용자별 암호화 설정에 연결된다',async t=>{
  const plugin={id:'test-extension',manifest:{name:'나의 확장',description:'테스트',fields:[{key:'feed',label:'주소',required:true},{key:'key',label:'비밀키',secret:true}]},pull:async(c,{store})=>[{externalId:'e',title:store.secretFor(c).key==='hidden'?'확장 성공':'실패'}]};
  const {request,register}=await fixture(t,[plugin]),u=await register('extension');
  assert.ok((await request('/catalog',{user:u})).body.services.some(x=>x.id==='test-extension'));
  const c=await request('/connections',{method:'POST',user:u,data:{provider:'test-extension',config:{feed:'https://example.com'},secrets:{key:'hidden'}}});
  assert.equal(c.status,201);assert.ok(!JSON.stringify(c.body).includes('hidden'));
  assert.equal((await request(`/connections/${c.body.connection.id}/sync`,{method:'POST',user:u,data:{}})).status,200);
  assert.equal((await request('/tasks',{user:u})).body.items[0].title,'확장 성공');
});
test('브리지 원본이 실제 ID로 보강되어도 개인 메모와 일정 하나를 보존한다',async t=>{
  const {app,register}=await fixture(t),u=await register('migration');
  const c=app.store.connection(u.user.id,'desktop-bridge','가져온 일정');
  const first=app.store.upsert(u.user.id,c,{source:'teams',externalId:'notion:old',courseId:'course',title:'이름',originRef:'https://notion.so/one'});
  app.store.run("UPDATE tasks SET personal_note='소중한 메모',progress='doing' WHERE id=?",first.id);
  app.store.upsert(u.user.id,c,{source:'teams',externalId:'real-id',courseId:'course',title:'이름 변경',originRef:'https://notion.so/one'});
  const items=app.store.listTasks(u.user.id);assert.equal(items.length,1);assert.equal(items[0].personalNote,'소중한 메모');assert.equal(items[0].progress,'doing');assert.equal(items[0].externalId,'real-id');
});
