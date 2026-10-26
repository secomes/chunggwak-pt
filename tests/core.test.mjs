import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { normalizeTask, isActive, stableKey, mapFeed, getPath } from '../src/core.mjs';
import { encrypt, decrypt, passwordHash, passwordMatch } from '../src/security.mjs';
import { isPublicAddress, publicJson } from '../src/network.mjs';
import { googleDue, googleAttachments, authorizationUrl } from '../src/providers.mjs';

test('학교 시간대 마감 · 제출 · 학습자료는 서로 다른 상태다', () => {
  const t = { kind:'task',status:'assigned',dueAt:'2026-10-26T21:00:00+09:00' };
  assert.equal(isActive(t,new Date('2026-10-26T11:59:00Z')),true);
  assert.equal(isActive(t,new Date('2026-10-26T12:01:00Z')),false);
  assert.equal(isActive({...t,dueAt:'2026-10-26'},new Date('2026-10-26T14:59:00Z')),true);
  assert.equal(isActive({...t,dueAt:'2026-10-26'},new Date('2026-10-26T15:00:00Z')),false);
  assert.equal(isActive({...t,dueAt:null,status:'submitted'}),false);
  assert.equal(isActive({...t,dueAt:null,kind:'notice'}),true);
  assert.equal(isActive({...t,dueAt:null,kind:'material'}),false);
});
test('같은 과제명도 원본 ID·수업·서비스가 다르면 다른 과제다', () => {
  const a=normalizeTask({externalId:'first',title:'주제탐구',courseId:'class-1'},'teams');
  assert.notEqual(stableKey(a),stableKey({...a,externalId:'second'}));
  assert.notEqual(stableKey(a),stableKey({...a,courseId:'class-2'}));
  assert.notEqual(stableKey(a),stableKey({...a,source:'classroom'}));
  assert.equal(normalizeTask({...a,dueAt:null},'classroom').kind,'material');
  assert.throws(()=>normalizeTask({title:'bad',externalId:'id',dueAt:'not-a-date'}),/마감일/);
});
test('자료 링크와 확장 매핑은 실행 코드와 프로토타입 접근을 허용하지 않는다', () => {
  assert.equal(normalizeTask({externalId:'x',title:'a',url:'javascript:alert(1)',attachments:[{name:'x',url:'data:text/html,x'}]}).url,'');
  assert.equal(getPath({a:1},'__proto__.constructor'),undefined);
  const rows=mapFeed([{key:'x',text:'일정',nested:{deadline:'2026-10-28'}}],{externalId:'key',title:'text',dueAt:'nested.deadline'});
  assert.equal(rows[0].title,'일정');assert.equal(rows[0].dueAt,'2026-10-28');
});
test('사용자 연결 토큰 암호화는 변조를 탐지한다', () => {
  const key=randomBytes(32),v={access_token:'private',refresh_token:'refresh'};const a=encrypt(key,v),b=encrypt(key,v);
  assert.notEqual(a,b);assert.deepEqual(decrypt(key,a),v);assert.throws(()=>decrypt(randomBytes(32),a));
});
test('비밀번호는 서로 다른 salt로 저장하고 평문과 구별한다', async () => {
  const a=await passwordHash('a-long-enough-password'),b=await passwordHash('a-long-enough-password');
  assert.notEqual(a,b);assert.equal(await passwordMatch('a-long-enough-password',a),true);assert.equal(await passwordMatch('wrong',a),false);
});
test('사용자 정의 서비스는 내부망·메타데이터·리다이렉션 우회 주소를 허용하지 않는다', async () => {
  for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1'])assert.equal(isPublicAddress(ip),false,ip);
  assert.equal(isPublicAddress('8.8.8.8'),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
  await assert.rejects(publicJson('https://127.0.0.1/private'),/내부망/);await assert.rejects(publicJson('http://example.com'),/HTTPS/);
});
test('Google의 UTC 마감 정보와 파일 이름을 그대로 보존한다',()=>{
  assert.equal(googleDue({dueDate:{year:2026,month:10,day:28},dueTime:{hours:14,minutes:59}}),'2026-10-28T14:59:00.000Z');
  assert.equal(googleDue({}),null);assert.equal(googleAttachments({materials:[{driveFile:{driveFile:{title:'양식.hwp',alternateLink:'https://drive.google.com/file/x'}}}]} )[0].name,'양식.hwp');
});
test('OAuth는 state와 PKCE를 포함하며 앱 정보 없이는 연결 성공을 가장하지 않는다',()=>{
  const old=process.env.GOOGLE_CLIENT_ID,secret=process.env.GOOGLE_CLIENT_SECRET;
  process.env.GOOGLE_CLIENT_ID='test-client';process.env.GOOGLE_CLIENT_SECRET='test-secret';
  const u=new URL(authorizationUrl('classroom',{publicUrl:'http://127.0.0.1:4318'},'unique-state','verifier'));
  assert.equal(u.searchParams.get('state'),'unique-state');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.ok(u.searchParams.get('code_challenge'));
  delete process.env.GOOGLE_CLIENT_ID;assert.throws(()=>authorizationUrl('classroom',{publicUrl:'http://127.0.0.1:4318'},'s','v'),/앱 등록/);
  if(old)process.env.GOOGLE_CLIENT_ID=old;else delete process.env.GOOGLE_CLIENT_ID;if(secret)process.env.GOOGLE_CLIENT_SECRET=secret;else delete process.env.GOOGLE_CLIENT_SECRET;
});
