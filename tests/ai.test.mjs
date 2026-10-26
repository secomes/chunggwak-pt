import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateProposal, aiEnvironment, createAI } from '../src/ai.mjs';
import { openStore } from '../src/store.mjs';
import { config } from '../src/config.mjs';

test('AI 변경안은 경로 탈출, 인증 코드 수정, 중복 파일을 거부한다',()=>{
  for(const p of ['../.env','C:/secret','data/master.key','src/security.mjs','src/server.mjs','public/../src/config.mjs','public/a.js/other'])assert.throws(()=>validateProposal({reply:'x',files:[{path:p,content:'x'}]}));
  assert.throws(()=>validateProposal({reply:'x',files:[{path:'public/app.js',content:'a'},{path:'public/app.js',content:'b'}]}));
  assert.equal(validateProposal({reply:'확인',files:[{path:'docs/NEW.md',content:'# 안내'}]}).files.length,1);
});
test('AI 하위 프로세스는 기존 OpenAI 키·CODEX_HOME·연결 토큰을 상속하지 않는다',()=>{
  const previous=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='owner-secret';
  try {const env=aiEnvironment('isolated-user-home');assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.CODEX_HOME,'isolated-user-home');assert.equal(env.GOOGLE_CLIENT_SECRET,undefined);}finally{if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous;}
});
test('AI 대화·변경안은 사용자 범위로 조회되고 타 사용자 적용은 거부한다',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cgpt-ai-test-')),cfg=config({dataDir:dir,codexBin:path.join(dir,'missing.exe')}),store=openStore(cfg),ai=createAI(cfg,store);
  t.after(async()=>{ai.close();store.close();await fs.rm(dir,{recursive:true,force:true});});
  const a={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',role:'owner'},b={id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',role:'member'};
  store.run('INSERT INTO ai_messages VALUES(?,?,?,?,?)','message',a.id,'user','나의 비공개 요구','2026-10-26');
  store.run('INSERT INTO ai_runs VALUES(?,?,?,?,?,?)','run',a.id,'proposed',JSON.stringify({reply:'x',files:[]}),null,'2026-10-26');
  assert.equal(ai.history(a).messages.length,1);assert.equal(ai.history(b).messages.length,0);assert.equal(ai.history(b).runs.length,0);
  assert.throws(()=>ai.apply(b,'run'),e=>e.status===403);assert.throws(()=>ai.apply({...b,role:'owner'},'run'),e=>e.status===409);
  assert.deepEqual(await ai.status(b),{available:false,connected:false});
});
