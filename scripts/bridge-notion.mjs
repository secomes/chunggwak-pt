import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) throw new Error('Notion 전체 기록의 JSON 파일 경로를 지정하세요.');
const raw = JSON.parse(await fs.readFile(input, 'utf8'));
const rows = Array.isArray(raw) ? raw : raw.results ?? raw.items;
if (!Array.isArray(rows)) throw new Error('results 또는 items 배열이 필요합니다.');
const seed = await fs.readFile(path.join(root, 'data/initial-import.json'), 'utf8').then(v=>JSON.parse(v).items).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
const plain = v => String(v ?? '').replace(/<br\s*\/?>/g, '\n').replace(/\\([\[\]_*~.])/g, '$1');
const decode = v => { const s=String(v??''); if (/^\d+$/.test(s)) return s; const d=Buffer.from(s,'base64').toString(); return /^\d+$/.test(d)?d:s; };
const items = rows.filter(r=>r['과제명']).map(r=>{
  const source=r['출처']==='Google Classroom'?'classroom':'teams',title=plain(r['과제명']),dueAt=r['date:마감일:start']||null;
  const matches=seed.filter(t=>t.source===source&&plain(t.title)===title&&(t.dueAt||null)===dueAt);
  const old=matches.length===1?matches[0]:null;
  const url=r['원문 링크']||r['Teams 원문']||old?.url||'';
  const ext=r['원본 ID'];
  const externalId=source==='classroom'?decode(ext||url.match(/\/a\/([^/]+)/)?.[1]||old?.externalId):ext||old?.externalId||'notion:'+r.url.split('/p/')[1];
  const courseId=source==='classroom'?decode(url.match(/\/c\/([^/]+)/)?.[1]||old?.courseId||r['과목']):old?.courseId||plain(r['과목']);
  const attachments=plain(r['첨부파일명']).split('\n').filter(Boolean).map(name=>({name,url:old?.attachments?.find(a=>plain(a.name)===name)?.url||''}));
  return {source,externalId,courseId,title,course:plain(r['과목']),dueAt,url,originRef:r.url,
    kind:r['구분']==='학습자료'?'material':r['구분']==='공지'?'notice':'task',
    status:r['제출 상태']==='제출 확인'?'submitted':r['제출 상태']==='미제출'?'assigned':'unknown',
    summary:plain(r['할 일 요약']),description:plain(r['메모']),verifiedAt:r['date:최근 확인:start']||null,attachments};
});
const bridge=JSON.parse(await fs.readFile(path.join(root,'data/desktop-bridge.json'),'utf8'));
const response=await fetch(bridge.url,{method:'POST',headers:{Authorization:`Bearer ${bridge.token}`,'Content-Type':'application/json'},body:JSON.stringify({items}),signal:AbortSignal.timeout(15000)});
const result=await response.json();if(!response.ok)throw new Error(result.error||'충곽피티로 전송하지 못했습니다.');
console.log(JSON.stringify({ok:true,records:items.length,...result}));
