import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('검사할 설치 폴더를 지정하세요.');
for(const rel of ['.env','data/master.key','data/local-launch.json','data/desktop-bridge.json','data/initial-import.json'])assert.equal(await fs.access(path.join(root,rel)).then(()=>true,()=>false),false,`설치본에 개인 파일이 포함됨: ${rel}`);
const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'cgpt-installed-check-'));
const {createApp}=await import(pathToFileURL(path.join(root,'src/server.mjs')));
const app=await createApp({port:0,publicUrl:'http://127.0.0.1:0',dataDir,noOwner:true,noScheduler:true,codexBin:path.join(root,'runtime/codex.exe')});
try{
  await app.listen();
  const health=await fetch(app.cfg.publicUrl+'/api/health');assert.equal((await health.json()).version,'1.1.0');
  assert.equal(app.store.get('SELECT count(*) AS n FROM users').n,0);
  const logo=await fetch(app.cfg.publicUrl+'/school-logo.png');assert.equal(logo.status,200);assert.equal((await logo.arrayBuffer()).byteLength,6314);
  const register=await fetch(app.cfg.publicUrl+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'설치 검사',email:'install-test@example.com',password:'temporary-test-password-123'})});assert.equal(register.status,201);
  const auth=await register.json(),cookie=register.headers.get('set-cookie').split(';')[0];
  const tasks=await fetch(app.cfg.publicUrl+'/api/tasks?view=all',{headers:{cookie}});assert.equal((await tasks.json()).items.length,0);
  const status=await fetch(app.cfg.publicUrl+'/api/ai/status',{headers:{cookie}}),a=await status.json();assert.equal(status.status,200);assert.equal(a.available,true);assert.equal(a.connected,false);assert.equal(a.email,null);
  const chat=await fetch(app.cfg.publicUrl+'/api/ai/chat',{method:'POST',headers:{cookie,'Content-Type':'application/json','X-CSRF-Token':auth.csrf},body:JSON.stringify({message:'로그인 없이 기존 운영자 계정으로 호출하면 안 됩니다.'})});assert.equal(chat.status,401);
  console.log('설치본 정상: 런타임 실행, 학교 로고, 빈 일정, 개인 ChatGPT 로그인 필수, 운영자 계정 미상속.');
}finally{
  await app.close();await fs.rm(dataDir,{recursive:true,force:true});
}
