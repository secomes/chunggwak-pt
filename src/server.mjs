import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config, ROOT } from './config.mjs';
import { openStore } from './store.mjs';
import { AppError, text, isActive, nextRun, normalizeTask } from './core.mjs';
import { hash, equal, encrypt, decrypt, randomToken, passwordHash, passwordMatch, cookieValue, rateLimiter } from './security.mjs';
import { CATALOG, createRegistry, oauthDefinition, authorizationUrl, exchangeCode, tokenData, testConnection, createNotionDatabase } from './providers.mjs';
import { createScheduler } from './scheduler.mjs';
import { extensions } from './extensions.mjs';
import { createAI } from './ai.mjs';

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SCOPES = ['tasks:read', 'tasks:write', 'sync:run'];
const LOOPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const now = () => new Date().toISOString();
function json(res, status, data, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(data)); }
function publicUser(u) { return { id: u.id, email: u.email, name: u.name, role: u.role, hasPassword: !!u.password }; }
async function body(req) {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new AppError(415, 'JSON 형식으로 요청해 주세요.');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 2_000_000) throw new AppError(413, '요청이 너무 큽니다.'); chunks.push(chunk); }
  try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (!v || typeof v !== 'object' || Array.isArray(v)) throw 0; return v; } catch { throw new AppError(400, 'JSON 내용을 확인해 주세요.'); }
}
function emailValue(s) { const v = text(s, 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new AppError(400, '이메일 형식을 확인해 주세요.'); return v; }
function cleanConfig(provider, input = {}) {
  if (provider === 'custom-feed') {
    let url; try { url = new URL(input.url); } catch { throw new AppError(400, '서비스 주소를 입력해 주세요.'); }
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new AppError(400, '공개 HTTPS 주소만 사용할 수 있습니다.');
    const mapping = {}; for (const [k, v] of Object.entries(input.mapping ?? {})) if (['externalId', 'title', 'course', 'courseId', 'description', 'summary', 'dueAt', 'status', 'kind', 'url', 'attachments'].includes(k)) mapping[k] = text(v, 100);
    return { url: url.href, itemsPath: text(input.itemsPath, 100), mapping };
  }
  if (provider === 'notion') { const id = text(input.dataSourceId, 100); if (id && !/^[a-f0-9-]{32,36}$/i.test(id)) throw new AppError(400, '데이터 소스 ID를 확인해 주세요.'); return { dataSourceId: id }; }
  return {};
}

export async function createApp(overrides = {}) {
  const extra = [...extensions, ...(overrides.plugins ?? [])];
  const cfg = config(overrides), store = openStore(cfg), registry = createRegistry(extra);
  const ai = createAI(cfg, store);
  const catalog = [...CATALOG, ...extra.filter(p => p.manifest).map(p => ({ ...p.manifest, id: p.id, auth: 'custom', category: 'source', fields: p.manifest.fields ?? [], detail: p.manifest.detail ?? p.manifest.description }))];
  const ctx = { cfg, store, registry, catalog }; const scheduler = createScheduler(ctx);
  for (const provider of ['classroom', 'teams', 'notion']) { const saved = store.get('SELECT value FROM settings WHERE key=?', `oauth:${provider}`); if (saved) { const v = decrypt(cfg.masterKey, saved.value); const prefix = provider === 'classroom' ? 'GOOGLE' : provider === 'teams' ? 'MICROSOFT' : 'NOTION'; process.env[`${prefix}_CLIENT_ID`] = v.clientId; process.env[`${prefix}_CLIENT_SECRET`] = v.clientSecret; if (v.tenantId) process.env.MICROSOFT_TENANT_ID = v.tenantId; } }
  const authLimit = rateLimiter(12, 15 * 60000), ingestLimit = rateLimiter(90, 60000), apiLimit = rateLimiter(300, 60000);
  let localKey;
  if (cfg.local && !overrides.noOwner) {
    let owner = store.get("SELECT * FROM users WHERE role='owner' ORDER BY created_at LIMIT 1");
    if (!owner) { const id = randomUUID(); store.run('INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,?,?)', id, 'local@chunggwak.local', '내 일정', 'owner', now()); owner = store.get('SELECT * FROM users WHERE id=?', id); }
    const keyPath = path.join(cfg.dataDir, 'local-owner.key');
    if (!fs.existsSync(keyPath)) fs.writeFileSync(keyPath, randomToken(), { flag: 'wx', mode: 0o600 });
    localKey = fs.readFileSync(keyPath, 'utf8').trim();
    let bridge = store.get("SELECT * FROM connections WHERE user_id=? AND provider='desktop-bridge'", owner.id);
    if (!bridge) bridge = store.connection(owner.id, 'desktop-bridge', '기존 데스크톱 자동 갱신', {}, { key: randomToken() }, 'waiting');
    const key = store.secretFor(bridge).key;
    fs.writeFileSync(path.join(cfg.dataDir, 'desktop-bridge.json'), JSON.stringify({ url: `${cfg.publicUrl}/api/ingest/${bridge.id}`, token: key, connectionId: bridge.id, userId: owner.id }, null, 2), { mode: 0o600 });
    fs.writeFileSync(path.join(cfg.dataDir, 'local-launch.json'), JSON.stringify({ url: `${cfg.publicUrl}/#local=${localKey}` }), { mode: 0o600 });
    const importPath = path.join(cfg.dataDir, 'initial-import.json');
    if (fs.existsSync(importPath) && !store.get("SELECT value FROM settings WHERE key='initial_import_done'")) {
      const seed = JSON.parse(fs.readFileSync(importPath, 'utf8')); store.ingest(owner.id, bridge, seed.items ?? seed);
      store.run("INSERT INTO settings(key,value) VALUES('initial_import_done',?)", now()); store.event(owner.id, '기존 일정과 학습자료를 내 로컬 프로필로 가져왔습니다.');
    }
  }
  function session(res, user) {
    const token = randomToken(), csrf = randomToken(), expires = new Date(Date.now() + 7 * 86400000).toISOString();
    store.run('INSERT INTO sessions(hash,user_id,csrf,expires_at) VALUES(?,?,?,?)', hash(token), user.id, csrf, expires);
    res.setHeader('Set-Cookie', `cgpt_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${cfg.publicUrl.startsWith('https:') ? '; Secure' : ''}`);
    return { user: publicUser(user), csrf };
  }
  function authenticate(req, scope) {
    const bearer = /^Bearer (.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (bearer) {
      const key = store.get('SELECT * FROM api_keys WHERE hash=?', hash(bearer)); if (!key) throw new AppError(401, 'API 키가 올바르지 않습니다.');
      if (!scope || !JSON.parse(key.scopes).includes(scope)) throw new AppError(403, '이 API 키에는 요청 권한이 없습니다.');
      return { user: store.get('SELECT * FROM users WHERE id=?', key.user_id), apiKey: true };
    }
    const s = store.get('SELECT * FROM sessions WHERE hash=? AND expires_at>?', hash(cookieValue(req, 'cgpt_session')), now());
    if (!s) throw new AppError(401, '먼저 로그인해 주세요.');
    if (WRITE.has(req.method) && !equal(req.headers['x-csrf-token'] ?? '', s.csrf)) throw new AppError(403, '화면을 새로 고친 뒤 다시 시도해 주세요.', 'csrf');
    return { user: store.get('SELECT * FROM users WHERE id=?', s.user_id), session: s };
  }
  function ownConnection(user, id) { const c = store.get('SELECT * FROM connections WHERE id=? AND user_id=?', id, user.id); if (!c) throw new AppError(404, '연결을 찾을 수 없습니다.'); return c; }
  function connectionView(c) {
    const s = store.secretFor(c);
    return { id: c.id, provider: c.provider, name: c.name, config: JSON.parse(c.config), enabled: !!c.enabled, intervalMinutes: c.interval_minutes, nextRun: c.next_run, lastSync: c.last_sync, status: c.status, error: c.error, account: s.accountLabel || null, hasSecret: !!(s.access_token || s.apiToken || s.key), running: scheduler.isRunning(c.id) };
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(req.url, cfg.publicUrl), route = url.pathname, method = req.method;
      const expected = new URL(cfg.publicUrl);
      if (req.headers.host !== expected.host) throw new AppError(403, '허용되지 않은 서버 주소입니다.');
      if (WRITE.has(method) && req.headers.origin && req.headers.origin !== expected.origin) throw new AppError(403, '허용되지 않은 요청 출처입니다.');
      if (route.startsWith('/api/')) apiLimit(req.socket.remoteAddress);
      if (route === '/api/health' && method === 'GET') return json(res, 200, { service: '충곽 뭐해', version: '2.0.0', ok: true });
      if (route === '/api/openapi.json' && method === 'GET') return json(res, 200, openApi(cfg.publicUrl));
      if (route === '/api/auth/register' && method === 'POST') {
        authLimit(req.socket.remoteAddress); if (!cfg.registration) throw new AppError(403, '회원가입이 비활성화되어 있습니다.');
        const b = await body(req), email = emailValue(b.email), name = text(b.name, 60); if (!name) throw new AppError(400, '사용할 이름을 입력해 주세요.');
        const password = await passwordHash(b.password), id = randomUUID();
        if (store.get('SELECT id FROM users WHERE email=?', email)) throw new AppError(409, '이미 등록된 이메일입니다.');
        store.run('INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)', id, email, name, password, now());
        return json(res, 201, session(res, store.get('SELECT * FROM users WHERE id=?', id)));
      }
      if (route === '/api/auth/login' && method === 'POST') {
        authLimit(req.socket.remoteAddress); const b = await body(req); const user = store.get('SELECT * FROM users WHERE email=?', text(b.email, 254).toLowerCase());
        if (!user || !await passwordMatch(b.password, user.password)) throw new AppError(401, '이메일 또는 비밀번호를 확인해 주세요.');
        return json(res, 200, session(res, user));
      }
      if (route === '/api/auth/local' && method === 'POST') {
        authLimit(req.socket.remoteAddress); const b = await body(req);
        if (!cfg.local || !LOOPS.has(req.socket.remoteAddress) || !localKey || !equal(b.token ?? '', localKey)) throw new AppError(403, '로컬 실행 바로가기로 접속해 주세요.');
        const user = store.get("SELECT * FROM users WHERE role='owner' ORDER BY created_at LIMIT 1"); return json(res, 200, session(res, user));
      }
      const callback = /^\/api\/oauth\/(classroom|teams|notion)\/callback$/.exec(route);
      if (callback && method === 'GET') {
        const userCtx = authenticate(req), stateHash = hash(url.searchParams.get('state') ?? '');
        const state = store.get('SELECT * FROM oauth_states WHERE hash=? AND user_id=? AND provider=? AND expires_at>?', stateHash, userCtx.user.id, callback[1], now());
        if (!state) throw new AppError(400, '로그인 연결 요청이 만료되었거나 현재 계정과 다릅니다. 다시 연결해 주세요.');
        store.run('DELETE FROM oauth_states WHERE hash=?', stateHash);
        if (url.searchParams.get('error')) { res.writeHead(303, { Location: '/#connections?oauth=denied' }); return res.end(); }
        const details = decrypt(cfg.masterKey, state.secret), code = text(url.searchParams.get('code'), 10000);
        if (!code) throw new AppError(400, '계정 연결 코드를 받지 못했습니다.');
        const token = tokenData(await exchangeCode(callback[1], cfg, code, details.verifier));
        if (!token.access_token) throw new AppError(502, '서비스 연결 토큰을 받지 못했습니다.');
        let c;
        if (details.connectionId) { c = ownConnection(userCtx.user, details.connectionId); if (c.provider !== callback[1]) throw new AppError(400, '연결 서비스가 다릅니다.'); store.setSecret(c.id, token); }
        else {
          if (callback[1] === 'notion' && store.get("SELECT id FROM connections WHERE user_id=? AND provider='notion'", userCtx.user.id)) throw new AppError(409, '기존 노션 연결에서 다시 연결을 선택해 주세요.');
          c = store.connection(userCtx.user.id, callback[1], CATALOG.find(p => p.id === callback[1]).name, {}, token);
        }
        store.run("UPDATE connections SET status='pending',error=NULL WHERE id=?", c.id);
        let profile;
        try { profile = await testConnection({ ...c, secret: encrypt(cfg.masterKey, token) }, ctx); }
        catch (error) { store.run("UPDATE connections SET status='error',error=? WHERE id=?", '연결 계정을 확인하지 못했습니다. 다시 연결해 주세요.', c.id); throw error; }
        store.setSecret(c.id, { ...token, accountLabel: profile.label }); store.run("UPDATE connections SET status='connected',enabled=1,error=NULL,next_run=? WHERE id=?", nextRun(1), c.id);
        store.event(userCtx.user.id, `${c.name} 계정을 연결했습니다.`); res.writeHead(303, { Location: '/#connections?oauth=connected' }); return res.end();
      }
      const ingest = /^\/api\/ingest\/([a-f0-9-]+)$/.exec(route);
      if (ingest && method === 'POST') {
        ingestLimit(req.socket.remoteAddress); const c = store.get('SELECT * FROM connections WHERE id=?', ingest[1]);
        const key = /^Bearer (.+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? '';
        if (!c || !['webhook', 'desktop-bridge'].includes(c.provider) || !c.enabled || !key || !store.secretFor(c).key || !equal(hash(key), hash(store.secretFor(c).key))) throw new AppError(401, '수신 연결 키가 올바르지 않습니다.');
        const b = await body(req); if (!Array.isArray(b.items) || b.items.length > 2000) throw new AppError(400, 'items에 2,000건 이하의 일정 배열을 보내 주세요.');
        const counts = store.ingest(c.user_id, c, b.items); store.run("UPDATE connections SET status='connected',last_sync=?,error=NULL WHERE id=?", now(), c.id);
        if (counts.created || counts.updated) store.event(c.user_id, `${c.name}: 새 항목 ${counts.created}건 · 변경 ${counts.updated}건`);
        return json(res, 200, { counts });
      }
      if (route.startsWith('/api/')) {
        const scope = route.startsWith('/api/tasks') || route === '/api/export' ? method === 'GET' ? 'tasks:read' : 'tasks:write' : route === '/api/sync' || /\/sync$/.test(route) ? 'sync:run' : undefined;
        const auth = authenticate(req, scope), user = auth.user;
        if (route === '/api/me' && method === 'GET') return json(res, 200, { user: publicUser(user), csrf: auth.session?.csrf, local: cfg.local });
        if (route === '/api/auth/logout' && method === 'POST') { store.run('DELETE FROM sessions WHERE hash=?', hash(cookieValue(req, 'cgpt_session'))); res.setHeader('Set-Cookie', 'cgpt_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'); return json(res, 200, { ok: true }); }
        if (route === '/api/profile' && method === 'PATCH') {
          const b = await body(req); const name = text(b.name ?? user.name, 60); if (!name) throw new AppError(400, '이름을 입력해 주세요.');
          if (b.password) {
            if (user.password && !await passwordMatch(b.currentPassword, user.password)) throw new AppError(403, '현재 비밀번호를 확인해 주세요.');
            store.run('UPDATE users SET password=? WHERE id=?', await passwordHash(b.password), user.id);
            store.run('DELETE FROM sessions WHERE user_id=? AND hash!=?', user.id, auth.session.hash);
          }
          const email = b.email ? emailValue(b.email) : user.email;
          if (email !== user.email && store.get('SELECT id FROM users WHERE email=?', email)) throw new AppError(409, '이미 사용 중인 이메일입니다.');
          store.run('UPDATE users SET name=?,email=? WHERE id=?', name, email, user.id); return json(res, 200, { user: publicUser(store.get('SELECT * FROM users WHERE id=?', user.id)) });
        }
        if (route === '/api/catalog' && method === 'GET') return json(res, 200, { services: catalog.map(p => ({ ...p, ready: p.auth === 'oauth' ? !!(oauthDefinition(p.id, cfg).clientId && (p.id !== 'notion' || oauthDefinition(p.id, cfg).clientSecret)) : true, callbackUrl: p.auth === 'oauth' ? oauthDefinition(p.id, cfg).redirect : undefined })) });
        if (route === '/api/tasks' && method === 'GET') {
          const view = url.searchParams.get('view') ?? 'active', q = (url.searchParams.get('q') ?? '').toLowerCase(), source = url.searchParams.get('source');
          const all = store.listTasks(user.id), current = new Date();
          const list = all.filter(t => (view === 'all' || view === 'materials' && t.kind === 'material' && t.status !== 'submitted' && t.progress !== 'done' || view === 'archive' && !isActive(t, current) && t.kind !== 'material' || view === 'active' && isActive(t, current)) && (!q || `${t.title} ${t.summary} ${t.course}`.toLowerCase().includes(q)) && (!source || t.source === source)).sort((a, b) => (a.dueAt || '9999').localeCompare(b.dueAt || '9999'));
          return json(res, 200, { items: list, stats: { active: all.filter(t => isActive(t, current) && t.kind === 'task').length, notices: all.filter(t => isActive(t, current) && t.kind === 'notice').length, materials: all.filter(t => t.kind === 'material' && t.status !== 'submitted' && t.progress !== 'done').length, archive: all.filter(t => !isActive(t, current) && t.kind !== 'material').length, total: all.length } });
        }
        if (route === '/api/tasks' && method === 'POST') { const b = await body(req); let c = store.get("SELECT * FROM connections WHERE user_id=? AND provider='manual'", user.id); if (!c) c = store.connection(user.id, 'manual', '직접 추가'); const result = store.upsert(user.id, c, { ...b, externalId: randomUUID() }); return json(res, 201, result); }
        const taskRoute = /^\/api\/tasks\/([a-f0-9-]+)$/.exec(route);
        if (taskRoute && method === 'PATCH') {
          const row = store.get('SELECT * FROM tasks WHERE id=? AND user_id=?', taskRoute[1], user.id); if (!row) throw new AppError(404, '일정을 찾을 수 없습니다.'); const b = await body(req);
          if (b.progress && !['unknown', 'todo', 'doing', 'done'].includes(b.progress)) throw new AppError(400, '진행 상태를 확인해 주세요.');
          store.run('UPDATE tasks SET progress=?,personal_note=?,updated_at=? WHERE id=? AND user_id=?', b.progress ?? row.progress, b.personalNote === undefined ? row.personal_note : text(b.personalNote, 5000), now(), row.id, user.id); return json(res, 200, { ok: true });
        }
        if (route === '/api/export' && method === 'GET') return json(res, 200, { version: 1, exportedAt: now(), items: store.listTasks(user.id) }, { 'Content-Disposition': 'attachment; filename="chunggwak-schedule.json"' });
        if (route === '/api/connections' && method === 'GET') return json(res, 200, { items: store.all('SELECT * FROM connections WHERE user_id=? ORDER BY created_at', user.id).map(connectionView) });
        if (route === '/api/connections' && method === 'POST') {
          const b = await body(req), p = catalog.find(x => x.id === b.provider); if (!p) throw new AppError(400, '등록된 서비스를 선택해 주세요.');
          if (['classroom', 'teams'].includes(p.id)) throw new AppError(400, '이 서비스는 계정 연결 버튼으로 연결해 주세요.');
          if (p.id === 'notion' && store.get("SELECT id FROM connections WHERE user_id=? AND provider='notion'", user.id)) throw new AppError(409, '노션 연결은 계정당 하나입니다. 기존 연결의 설정을 수정해 주세요.');
          const secret = p.id === 'webhook' ? { key: randomToken() } : p.id === 'notion' ? { access_token: text(b.token, 2000) } : p.id === 'custom-feed' ? { apiToken: text(b.apiToken, 2000) } : {};
          if (p.id === 'notion' && !secret.access_token) throw new AppError(400, '노션 연결 토큰을 입력하거나 OAuth로 연결해 주세요.');
          let settings = cleanConfig(p.id, b.config);
          if (!CATALOG.some(x => x.id === p.id)) { settings = {}; for (const field of p.fields) { const value = text(field.secret ? b.secrets?.[field.key] : b.config?.[field.key], 2000); if (field.required && !value) throw new AppError(400, `${field.label} 항목이 필요합니다.`); if (field.secret) secret[field.key] = value; else settings[field.key] = value; } }
          const c = store.connection(user.id, p.id, text(b.name, 100) || p.name, settings, secret, p.id === 'webhook' ? 'waiting' : 'connected');
          return json(res, 201, { connection: connectionView(c), ...(p.id === 'webhook' ? { ingest: { url: `${cfg.publicUrl}/api/ingest/${c.id}`, token: secret.key } } : {}) });
        }
        const cr = /^\/api\/connections\/([a-f0-9-]+)(?:\/(sync|test|key|notion-database))?$/.exec(route);
        if (cr) {
          const c = ownConnection(user, cr[1]);
          if (cr[2] === 'sync' && method === 'POST') return json(res, 200, await scheduler.sync(c.id, user.id));
          if (cr[2] === 'test' && method === 'POST') return json(res, 200, await testConnection(c, ctx));
          if (cr[2] === 'key' && method === 'POST') { if (!['webhook', 'desktop-bridge'].includes(c.provider)) throw new AppError(400, '수신 연결에서만 사용할 수 있습니다.'); const key = randomToken(); store.setSecret(c.id, { ...store.secretFor(c), key }); if (cfg.local && c.provider === 'desktop-bridge') { const file = path.join(cfg.dataDir, 'desktop-bridge.json'); if (fs.existsSync(file)) { const saved = JSON.parse(fs.readFileSync(file, 'utf8')); if (saved.connectionId === c.id) fs.writeFileSync(file, JSON.stringify({ ...saved, token: key }), { mode: 0o600 }); } } return json(res, 200, { url: `${cfg.publicUrl}/api/ingest/${c.id}`, token: key }); }
          if (cr[2] === 'notion-database' && method === 'POST') { if (c.provider !== 'notion') throw new AppError(400, '노션 연결을 선택해 주세요.'); const b = await body(req); if (!/^[a-f0-9-]{32,36}$/i.test(b.pageId ?? '')) throw new AppError(400, '부모 페이지 ID를 확인해 주세요.'); return json(res, 201, await createNotionDatabase(c, ctx, b.pageId)); }
          if (!cr[2] && method === 'PATCH') { if (scheduler.isRunning(c.id)) throw new AppError(409, '갱신 완료 후 설정을 바꿔 주세요.'); const b = await body(req); const interval = b.intervalMinutes ?? c.interval_minutes; if (!Number.isInteger(interval) || interval < 5 || interval > 10080) throw new AppError(400, '갱신 간격은 5~10,080분으로 설정해 주세요.'); const settings = b.config ? cleanConfig(c.provider, b.config) : JSON.parse(c.config); store.run('UPDATE connections SET enabled=?,interval_minutes=?,config=?,next_run=? WHERE id=? AND user_id=?', b.enabled === undefined ? c.enabled : Number(!!b.enabled), interval, JSON.stringify(settings), nextRun(interval), c.id, user.id); if (b.token && c.provider === 'notion') store.setSecret(c.id, { access_token: text(b.token, 2000) }); return json(res, 200, { ok: true }); }
          if (!cr[2] && method === 'DELETE') { if (scheduler.isRunning(c.id)) throw new AppError(409, '갱신 완료 후 연결을 해제해 주세요.'); store.run("UPDATE connections SET enabled=0,secret=NULL,status='disconnected',error=NULL WHERE id=? AND user_id=?", c.id, user.id); return json(res, 200, { ok: true }); }
        }
        const oauthStart = /^\/api\/oauth\/(classroom|teams|notion)\/start$/.exec(route);
        if (oauthStart && method === 'POST') { const b = await body(req); if (b.connectionId) { const c = ownConnection(user, b.connectionId); if (c.provider !== oauthStart[1]) throw new AppError(400, '서비스가 일치하지 않습니다.'); } const state = randomToken(), verifier = randomToken(); const authUrl = authorizationUrl(oauthStart[1], cfg, state, verifier); store.run('INSERT INTO oauth_states(hash,user_id,provider,secret,expires_at) VALUES(?,?,?,?,?)', hash(state), user.id, oauthStart[1], encrypt(cfg.masterKey, { verifier, connectionId: b.connectionId }), new Date(Date.now() + 10 * 60000).toISOString()); return json(res, 200, { url: authUrl }); }
        if (route === '/api/sync' && method === 'POST') { const results = []; const connections = store.all("SELECT * FROM connections WHERE user_id=? AND enabled=1 ORDER BY CASE WHEN provider='notion' THEN 1 ELSE 0 END", user.id); for (const c of connections) { try { results.push({ id: c.id, ...await scheduler.sync(c.id, user.id) }); } catch (e) { results.push({ id: c.id, status: 'failed', error: e.message }); } } return json(res, 200, { results }); }
        if (route.startsWith('/api/ai/')) {
          if (route === '/api/ai/status' && method === 'GET') return json(res,200,await ai.status(user));
          if (route === '/api/ai/history' && method === 'GET') return json(res,200,ai.history(user));
          if (route === '/api/ai/login' && method === 'POST') {const b=await body(req);return json(res,200,await ai.login(user,!!b.device));}
          if (route === '/api/ai/logout' && method === 'POST') {await ai.logout(user);return json(res,200,{ok:true});}
          if (route === '/api/ai/chat' && method === 'POST') {const b=await body(req);return json(res,202,await ai.chat(user,b.message));}
          const apply = /^\/api\/ai\/runs\/([a-f0-9-]+)\/apply$/.exec(route);
          if (apply && method === 'POST') return json(res,200,ai.apply(user,apply[1]));
        }
        if (route === '/api/jobs' && method === 'GET') return json(res, 200, { jobs: store.all('SELECT j.*,c.name FROM jobs j JOIN connections c ON c.id=j.connection_id WHERE j.user_id=? ORDER BY started_at DESC LIMIT 60', user.id).map(j => ({ id: j.id, name: j.name, status: j.status, counts: j.counts ? JSON.parse(j.counts) : null, error: j.error, startedAt: j.started_at, finishedAt: j.finished_at })), events: store.all('SELECT message,created_at AS createdAt FROM events WHERE user_id=? ORDER BY id DESC LIMIT 30', user.id) });
        if (route === '/api/keys' && method === 'GET') return json(res, 200, { items: store.all('SELECT id,name,scopes,created_at AS createdAt FROM api_keys WHERE user_id=?', user.id).map(k => ({ ...k, scopes: JSON.parse(k.scopes) })) });
        if (route === '/api/keys' && method === 'POST') { const b = await body(req), scopes = Array.isArray(b.scopes) ? [...new Set(b.scopes.filter(x => SCOPES.includes(x)))] : ['tasks:read']; if (!scopes.length) throw new AppError(400, 'API 권한을 선택해 주세요.'); const token = `cgpt_${randomToken()}`, id = randomUUID(); store.run('INSERT INTO api_keys(id,user_id,hash,name,scopes,created_at) VALUES(?,?,?,?,?,?)', id, user.id, hash(token), text(b.name, 100) || '개인 API 키', JSON.stringify(scopes), now()); return json(res, 201, { id, token, scopes }); }
        const keyRoute = /^\/api\/keys\/([a-f0-9-]+)$/.exec(route); if (keyRoute && method === 'DELETE') { store.run('DELETE FROM api_keys WHERE id=? AND user_id=?', keyRoute[1], user.id); return json(res, 200, { ok: true }); }
        if (route === '/api/admin/oauth' && method === 'POST') {
          if (user.role !== 'owner') throw new AppError(403, '운영자만 앱 등록 정보를 설정할 수 있습니다.');
          const b = await body(req); if (!['classroom', 'teams', 'notion'].includes(b.provider) || !text(b.clientId) || (b.provider === 'notion' && !text(b.clientSecret))) throw new AppError(400, '앱 등록 정보를 입력해 주세요. Notion은 비밀 키도 필요합니다.');
          if (b.tenantId && !/^[a-zA-Z0-9.-]+$/.test(b.tenantId)) throw new AppError(400, '테넌트 ID 형식을 확인해 주세요.');
          const v = { clientId: text(b.clientId, 1000), clientSecret: text(b.clientSecret, 2000), tenantId: text(b.tenantId, 100) };
          store.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', `oauth:${b.provider}`, encrypt(cfg.masterKey, v));
          const prefix = b.provider === 'classroom' ? 'GOOGLE' : b.provider === 'teams' ? 'MICROSOFT' : 'NOTION'; process.env[`${prefix}_CLIENT_ID`] = v.clientId; process.env[`${prefix}_CLIENT_SECRET`] = v.clientSecret; if (v.tenantId) process.env.MICROSOFT_TENANT_ID = v.tenantId;
          return json(res, 200, { ok: true });
        }
        throw new AppError(404, 'API 경로를 찾을 수 없습니다.');
      }
      if (!['GET', 'HEAD'].includes(method)) throw new AppError(405, '지원하지 않는 요청입니다.');
      const files = { '/brand-logo.png': ['brand-logo.png', 'image/png'], '/school-logo.png': ['school-logo.png', 'image/png'], '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'], '/icon.svg': ['icon.svg', 'image/svg+xml'] };
      const file = files[route]; if (!file) throw new AppError(404, '페이지를 찾을 수 없습니다.');
      res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(method === 'HEAD' ? '' : fs.readFileSync(path.join(ROOT, 'public', file[0])));
    } catch (e) { if (res.headersSent) return res.end(); const status = e instanceof AppError ? e.status : 500; if (status === 500) console.error('Request failed:', e.name, e.code ?? 'internal'); json(res, status, { error: e instanceof AppError ? e.message : '요청을 처리하지 못했습니다.', code: e instanceof AppError ? e.code : 'internal_error' }); }
  });
  server.requestTimeout = 180000; server.headersTimeout = 30000;
  return { ...ctx, server, scheduler, async listen() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(cfg.port, cfg.host, resolve); }); if (cfg.port === 0) { cfg.port = server.address().port; cfg.publicUrl = `http://127.0.0.1:${cfg.port}`; } if (!overrides.noScheduler) scheduler.start(); return server.address(); }, async close() { ai.close(); await scheduler.stop(); await new Promise(resolve => server.close(resolve)); store.close(); } };
}

function openApi(base) {
  const paths = {
    '/api/health': { get: { summary: '서버 상태 확인' } },
    '/api/tasks': { get: { summary: '내 일정 조회', parameters: [{ name: 'view', in: 'query', schema: { type: 'string', enum: ['active', 'materials', 'archive', 'all'] } }] }, post: { summary: '개인 일정 추가', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskInput' } } } } } },
    '/api/tasks/{id}': { patch: { summary: '내 일정의 진행 상태와 메모 변경', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { progress: { type: 'string', enum: ['unknown', 'todo', 'doing', 'done'] }, personalNote: { type: 'string' } } } } } } } },
    '/api/sync': { post: { summary: '내 연결 서비스 즉시 갱신' } }, '/api/export': { get: { summary: '내 일정 JSON 내보내기' } },
    '/api/ingest/{connectionId}': { post: { summary: '연결별 수신 키로 일정 갱신', parameters: [{ name: 'connectionId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { $ref: '#/components/schemas/TaskInput' }, maxItems: 2000 } } } } } } } }
  };
  for (const operations of Object.values(paths)) for (const op of Object.values(operations)) op.responses = { 200: { description: '성공' }, 400: { description: '잘못된 입력' }, 401: { description: '인증 필요' }, 403: { description: '권한 없음' } };
  return { openapi: '3.1.0', info: { title: '충곽 뭐해 API', version: '2.0.0', description: '모든 데이터는 인증된 사용자 범위로 제한됩니다. 수신 API는 연결별 전용 Bearer 키를 사용합니다.' }, servers: [{ url: base }], security: [{ bearerAuth: [] }], paths, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }, schemas: { TaskInput: { type: 'object', required: ['title'], properties: { externalId: { type: 'string', description: '수신 API 필수 원본 ID' }, courseId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, summary: { type: 'string' }, dueAt: { type: ['string', 'null'] }, kind: { type: 'string', enum: ['task', 'material', 'notice'] }, status: { type: 'string', enum: ['assigned', 'submitted', 'unknown'] }, attachments: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string' } } } }, url: { type: 'string' } } } } } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await createApp(); await app.listen(); console.log(`충곽 뭐해: ${app.cfg.publicUrl}`);
  const stop = async () => { await app.close(); process.exit(0); }; process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
