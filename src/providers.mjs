import { createHash } from 'node:crypto';
import { AppError, cleanHtml, getPath, mapFeed, text } from './core.mjs';
import { publicJson } from './network.mjs';

export const CATALOG = [
  { id: 'classroom', name: 'Google Classroom', icon: 'G', color: 'green', category: 'source', description: '수업별 과제·제출 상태·학습자료를 읽어 옵니다.', auth: 'oauth', fields: [], detail: '각자 구글 계정으로 연결합니다. 마감일 없는 항목은 학습자료로 분류합니다.' },
  { id: 'teams', name: 'Microsoft Teams', icon: 'T', color: 'purple', category: 'source', description: '학교 Teams의 개인 과제와 제출 상태를 모읍니다.', auth: 'oauth', fields: [], detail: 'Microsoft Graph의 학교 과제 권한은 관리자 승인이 필요합니다. 승인받은 계정만 직접 연결되며, 기존 연결은 데스크톱 브리지로 유지할 수 있습니다.' },
  { id: 'notion', name: 'Notion', icon: 'N', color: 'ink', category: 'destination', description: '나의 노션 일정표에 과제와 요약을 저장합니다.', auth: 'oauth', fields: [{ key: 'dataSourceId', label: '노션 데이터 소스 ID', placeholder: '연결 후 저장할 데이터 소스 ID' }], detail: '사용자가 선택해 허용한 워크스페이스만 사용합니다. 개인 연결 토큰으로도 연결할 수 있습니다.' },
  { id: 'custom-feed', name: '나만의 JSON 서비스', icon: '+', color: 'orange', category: 'source', description: '다른 서비스의 JSON 일정을 같은 형식으로 연결합니다.', auth: 'custom', fields: [{ key: 'url', label: '공개 HTTPS JSON 주소', placeholder: 'https://example.com/my-schedule.json', required: true }, { key: 'itemsPath', label: '일정 배열 경로', placeholder: 'items (응답 자체가 배열이면 비워 두기)' }, { key: 'apiToken', label: '서비스 API 토큰 (선택)', secret: true }], detail: '제목·날짜·원본 ID의 필드 이름을 지정할 수 있습니다. 비공개 내부망 주소와 임의 코드 실행은 허용하지 않습니다.' },
  { id: 'webhook', name: '수신 API / 자동화 연결', icon: '↗', color: 'blue', category: 'source', description: 'Power Automate·다른 프로그램에서 일정을 보냅니다.', auth: 'webhook', fields: [], detail: '연결별 전용 키로 일정을 수신합니다. 같은 원본 ID는 추가가 아니라 갱신됩니다.' },
  { id: 'manual', name: '직접 추가', icon: '✎', color: 'pink', category: 'source', description: '나만의 일정과 할 일을 직접 적습니다.', auth: 'none', fields: [], detail: '별도 계정 연결 없이 바로 사용할 수 있습니다.' }
];

export function oauthDefinition(provider, cfg) {
  const redirect = `${cfg.publicUrl}/api/oauth/${provider}/callback`;
  if (provider === 'classroom') return { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', redirect,
    scope: ['openid', 'email', 'https://www.googleapis.com/auth/classroom.courses.readonly', 'https://www.googleapis.com/auth/classroom.coursework.me.readonly', 'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly'].join(' ') };
  if (provider === 'teams') {
    const tenant = process.env.MICROSOFT_TENANT_ID ?? 'organizations';
    if (!/^[a-zA-Z0-9.-]+$/.test(tenant)) throw new AppError(500, 'Microsoft 테넌트 설정을 확인해 주세요.');
    return { clientId: process.env.MICROSOFT_CLIENT_ID, clientSecret: process.env.MICROSOFT_CLIENT_SECRET, auth: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`, token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, redirect, scope: 'openid email offline_access User.Read EduAssignments.ReadBasic' };
  }
  if (provider === 'notion') return { clientId: process.env.NOTION_CLIENT_ID, clientSecret: process.env.NOTION_CLIENT_SECRET, auth: 'https://api.notion.com/v1/oauth/authorize', token: 'https://api.notion.com/v1/oauth/token', redirect };
  throw new AppError(404, '지원하지 않는 계정 연결입니다.');
}
export function authorizationUrl(provider, cfg, state, verifier) {
  const d = oauthDefinition(provider, cfg);
  if (!d.clientId || !d.clientSecret) throw new AppError(409, '운영자가 이 서비스의 앱 등록 정보를 먼저 설정해야 합니다.', 'oauth_setup_required');
  const u = new URL(d.auth); u.searchParams.set('client_id', d.clientId); u.searchParams.set('redirect_uri', d.redirect); u.searchParams.set('response_type', 'code'); u.searchParams.set('state', state);
  if (provider === 'notion') u.searchParams.set('owner', 'user');
  else { u.searchParams.set('scope', d.scope); u.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url')); u.searchParams.set('code_challenge_method', 'S256'); }
  if (provider === 'classroom') { u.searchParams.set('access_type', 'offline'); u.searchParams.set('prompt', 'consent select_account'); }
  if (provider === 'teams') u.searchParams.set('prompt', 'select_account');
  return u.href;
}
export async function exchangeCode(provider, cfg, code, verifier) {
  const d = oauthDefinition(provider, cfg);
  if (provider === 'notion') return publicJson(d.token, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${d.clientId}:${d.clientSecret}`).toString('base64')}` }, body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: d.redirect }) });
  return publicJson(d.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: d.clientId, client_secret: d.clientSecret, code, code_verifier: verifier, redirect_uri: d.redirect, grant_type: 'authorization_code' }).toString() });
}
export function tokenData(token, old = {}) { return { ...old, ...token, expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : null }; }
async function accessToken(connection, ctx) {
  let s = ctx.store.secretFor(connection);
  if (s.expiresAt && s.expiresAt < Date.now() + 60000) {
    if (!s.refresh_token) throw new AppError(424, '연결이 만료되었습니다. 계정을 다시 연결해 주세요.');
    const d = oauthDefinition(connection.provider, ctx.cfg);
    const response = connection.provider === 'notion'
      ? await publicJson(d.token, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${d.clientId}:${d.clientSecret}`).toString('base64')}` }, body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: s.refresh_token }) })
      : await publicJson(d.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refresh_token, client_id: d.clientId, client_secret: d.clientSecret, ...(connection.provider === 'teams' ? { scope: d.scope } : {}) }).toString() });
    s = tokenData(response, s); ctx.store.setSecret(connection.id, s);
  }
  if (!s.access_token) throw new AppError(424, '먼저 서비스 계정을 연결해 주세요.');
  return s.access_token;
}
function onlyHost(url, hostname) { const u = new URL(url); if (u.hostname !== hostname || u.protocol !== 'https:') throw new AppError(502, '허용되지 않은 서비스 응답 주소입니다.'); return u.href; }
async function googlePages(path, field, token, optional = false) {
  let url = new URL(`https://classroom.googleapis.com/v1/${path}`), items = [];
  for (let n = 0; n < 100; n++) {
    let r; try { r = await publicJson(url.href, { headers: { Authorization: `Bearer ${token}` } }); } catch (e) { if (optional && e.code === 'provider_404') return []; throw e; }
    items.push(...(r[field] ?? [])); if (!r.nextPageToken) return items; url.searchParams.set('pageToken', r.nextPageToken);
  }
  throw new AppError(502, '서비스의 페이지 수가 너무 많습니다. 전체 갱신을 완료하지 못했습니다.');
}
async function graphPages(path, token) {
  let url = `https://graph.microsoft.com/v1.0/${path}`, items = [];
  for (let n = 0; n < 100; n++) { const r = await publicJson(onlyHost(url, 'graph.microsoft.com'), { headers: { Authorization: `Bearer ${token}` } }); items.push(...(r.value ?? [])); if (!r['@odata.nextLink']) return items; url = r['@odata.nextLink']; }
  throw new AppError(502, '전체 과제 페이지를 완료하지 못했습니다.');
}
export function googleDue(item) {
  if (!item.dueDate) return null;
  const d = item.dueDate, t = item.dueTime ?? {};
  return new Date(Date.UTC(d.year, d.month - 1, d.day, t.hours ?? 0, t.minutes ?? 0, t.seconds ?? 0)).toISOString();
}
export function googleAttachments(item) {
  return (item.materials ?? []).map(a => a.driveFile?.driveFile ? { name: a.driveFile.driveFile.title, url: a.driveFile.driveFile.alternateLink } : a.link ? { name: a.link.title || a.link.url, url: a.link.url } : a.youtubeVideo ? { name: a.youtubeVideo.title, url: a.youtubeVideo.alternateLink } : a.form ? { name: a.form.title, url: a.form.formUrl } : null).filter(Boolean);
}
async function pullClassroom(connection, ctx) {
  const token = await accessToken(connection, ctx);
  const courses = await googlePages('courses?studentId=me&courseStates=ACTIVE&pageSize=100', 'courses', token);
  const results = [];
  for (const c of courses) {
    const id = encodeURIComponent(c.id);
    const work = await googlePages(`courses/${id}/courseWork?pageSize=100`, 'courseWork', token);
    // Fetch only this student's submissions and exclude grade fields from the request.
    const submissions = await googlePages(`courses/${id}/courseWork/-/studentSubmissions?userId=me&pageSize=100&fields=nextPageToken,studentSubmissions(courseWorkId,state,updateTime)`, 'studentSubmissions', token);
    const byId = new Map(submissions.map(x => [x.courseWorkId, x]));
    const materials = await googlePages(`courses/${id}/courseWorkMaterials?pageSize=100`, 'courseWorkMaterial', token);
    for (const item of [...work, ...materials]) {
      const submission = byId.get(item.id);
      results.push({ externalId: item.id, courseId: c.id, title: item.title, course: c.name, description: item.description, kind: item.dueDate ? 'task' : 'material', dueAt: googleDue(item), attachments: googleAttachments(item), url: item.alternateLink,
        status: ['TURNED_IN', 'RETURNED'].includes(submission?.state) ? 'submitted' : submission ? 'assigned' : 'unknown', sourceUpdatedAt: item.updateTime });
    }
  }
  return results;
}
async function pullTeams(connection, ctx) {
  const token = await accessToken(connection, ctx);
  const profile = await publicJson('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', { headers: { Authorization: `Bearer ${token}` } });
  const assignments = await graphPages('education/me/assignments?$top=100', token), results = [];
  const classNames = new Map();
  for (const brief of assignments) {
    const classId = brief.classId, id = brief.id;
    if (!classId || !id) throw new AppError(502, 'Teams 과제의 수업 식별자가 없습니다.');
    const base = `education/classes/${encodeURIComponent(classId)}/assignments/${encodeURIComponent(id)}`;
    const h = { headers: { Authorization: `Bearer ${token}` } };
    const item = await publicJson(`https://graph.microsoft.com/v1.0/${base}`, h);
    if (!classNames.has(classId)) { const c = await publicJson(`https://graph.microsoft.com/v1.0/education/classes/${encodeURIComponent(classId)}?$select=displayName`, h); classNames.set(classId, c.displayName); }
    const resources = await graphPages(`${base}/resources`, token);
    const submissions = await graphPages(`${base}/submissions`, token);
    const mine = submissions.filter(s => s.recipient?.userId === profile.id || s.submittedBy?.user?.id === profile.id);
    results.push({ externalId: id, courseId: classId, title: item.displayName, course: classNames.get(classId), description: cleanHtml(item.instructions?.content), dueAt: item.dueDateTime, kind: 'task', url: item.webUrl,
      attachments: resources.map(r => ({ name: r.resource?.displayName, url: r.resource?.fileUrl || r.resource?.link })),
      status: mine.some(s => ['submitted', 'returned', 'reassigned'].includes(s.status) && s.status !== 'reassigned') ? 'submitted' : mine.length ? 'assigned' : 'unknown', sourceUpdatedAt: item.lastModifiedDateTime });
  }
  return results;
}

const rich = s => [{ type: 'text', text: { content: text(s, 1900) } }];
async function notionRequest(path, ctx, connection, method = 'GET', data) {
  const token = await accessToken(connection, ctx);
  return publicJson(`https://api.notion.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Notion-Version': ctx.cfg.notionVersion, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
}
export async function createNotionDatabase(connection, ctx, pageId) {
  const response = await notionRequest('databases', ctx, connection, 'POST', { parent: { type: 'page_id', page_id: pageId }, title: rich('충곽피티 일정표'), initial_data_source: { properties: {
    '과제명': { title: {} }, '할 일 요약': { rich_text: {} }, '마감일': { date: {} }, '첨부파일명': { rich_text: {} }, '원문 링크': { url: {} }, '과목': { rich_text: {} }, '출처': { rich_text: {} }, '구분': { select: { options: [{ name: '과제' }, { name: '학습자료' }, { name: '공지' }] } }, '제출 상태': { select: { options: [{ name: '미제출' }, { name: '제출 확인' }, { name: '확인 필요' }] } }, '최근 확인': { date: {} }, '원본 ID': { rich_text: {} }, '충곽피티 ID': { rich_text: {} }
  } } });
  const id = response.data_sources?.[0]?.id; if (!id) throw new AppError(502, '새 노션 데이터 소스 ID를 확인하지 못했습니다.');
  ctx.store.run('UPDATE connections SET config=? WHERE id=?', JSON.stringify({ ...JSON.parse(connection.config), dataSourceId: id }), connection.id);
  return { databaseId: response.id, dataSourceId: id, url: response.url };
}
async function pushNotion(connection, ctx) {
  const config = JSON.parse(connection.config); if (!/^[a-f0-9-]{32,36}$/i.test(config.dataSourceId ?? '')) throw new AppError(409, '노션에 저장할 데이터 소스를 먼저 설정해 주세요.');
  const ds = await notionRequest(`data_sources/${config.dataSourceId}`, ctx, connection);
  const schema = ds.properties ?? {};
  if (!schema['과제명'] || !schema['할 일 요약']) throw new AppError(409, '과제명·할 일 요약 속성이 있는 노션 일정표를 선택해 주세요.');
  const pages = []; let cursor;
  for (let n = 0; n < 100; n++) { const r = await notionRequest(`data_sources/${config.dataSourceId}/query`, ctx, connection, 'POST', { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }); pages.push(...r.results); if (!r.has_more) break; cursor = r.next_cursor; if (n === 99) throw new AppError(502, '노션 페이지를 전부 읽지 못했습니다.'); }
  const propText = (p, name) => (p.properties?.[name]?.rich_text ?? p.properties?.[name]?.title ?? []).map(x => x.plain_text ?? x.text?.content ?? '').join('');
  const byId = new Map(pages.filter(p => propText(p, '충곽피티 ID')).map(p => [propText(p, '충곽피티 ID'), p]));
  const counts = { created: 0, updated: 0, unchanged: 0 };
  for (const task of ctx.store.listTasks(connection.user_id)) {
    const properties = {};
    const values = { '과제명': task.title, '할 일 요약': task.summary, '과목': task.course, '출처': task.source === 'classroom' ? 'Google Classroom' : task.source === 'teams' ? 'Teams' : task.source, '구분': task.kind === 'material' ? '학습자료' : task.kind === 'notice' ? '공지' : '과제', '제출 상태': task.status === 'submitted' ? '제출 확인' : task.status === 'assigned' ? '미제출' : '확인 필요', '첨부파일명': task.attachments.map(a => a.name).join('\n'), '원본 ID': task.externalId, '충곽피티 ID': task.id };
    for (const [key, value] of Object.entries(values)) { const type = schema[key]?.type; if (['title', 'rich_text'].includes(type)) properties[key] = { [type]: rich(value) }; else if (type === 'select') properties[key] = { select: { name: value } }; }
    if (schema['마감일']?.type === 'date') properties['마감일'] = { date: task.dueAt ? { start: task.dueAt } : null };
    if (schema['원문 링크']?.type === 'url') properties['원문 링크'] = { url: task.url || null };
    if (schema['최근 확인']?.type === 'date') properties['최근 확인'] = { date: { start: task.verifiedAt || task.lastSeenAt } };
    // Exact source/course/deadline matching safely reuses the existing tracker.
    const canonicalId = value => { if (task.source !== 'classroom' || /^\d+$/.test(value)) return value; const decoded = Buffer.from(value, 'base64').toString(); return /^\d+$/.test(decoded) ? decoded : value; };
    const matches = pages.filter(p => canonicalId(propText(p, '원본 ID')) === task.externalId && propText(p, '출처') === values['출처']);
    const originId = (task.originRef || '').match(/[a-f0-9]{32}|[a-f0-9-]{36}/i)?.[0]?.replaceAll('-', '');
    const originPage = originId ? pages.find(p => p.id.replaceAll('-', '') === originId) : null;
    const existing = byId.get(task.id) ?? originPage ?? (matches.length === 1 ? matches[0] : null);
    if (existing) { await notionRequest(`pages/${existing.id}`, ctx, connection, 'PATCH', { properties }); counts.updated++; }
    else { await notionRequest('pages', ctx, connection, 'POST', { parent: { type: 'data_source_id', data_source_id: config.dataSourceId }, properties, children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: rich(task.summary) } }, ...task.attachments.filter(a => a.url).slice(0, 30).map(a => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: text(a.name, 1000), link: { url: a.url } } }] } }))] }); counts.created++; }
    // Respect the Notion API's average request limit.
    await new Promise(resolve => setTimeout(resolve, 360));
  }
  return counts;
}

export function createRegistry(extra = []) {
  const plugins = new Map([
    ['classroom', { pull: pullClassroom }], ['teams', { pull: pullTeams }], ['notion', { push: pushNotion }],
    ['custom-feed', { pull: async (c, ctx) => { const config = JSON.parse(c.config), secret = ctx.store.secretFor(c); const value = await publicJson(config.url, { headers: secret.apiToken ? { Authorization: `Bearer ${secret.apiToken}` } : {} }); const list = getPath(value, config.itemsPath); if (!Array.isArray(list) || list.length > 2000) throw new AppError(400, 'JSON 서비스 응답은 2,000건 이하의 일정 배열이어야 합니다.'); return mapFeed(list, config.mapping ?? {}); } }],
    ['manual', { passive: true }], ['webhook', { passive: true }], ['desktop-bridge', { passive: true }]
  ]);
  for (const plugin of extra) { if (!plugin.id || plugins.has(plugin.id) || typeof plugin.pull !== 'function') throw new Error('플러그인 ID와 pull 구현을 확인하세요.'); plugins.set(plugin.id, plugin); }
  return plugins;
}
export async function testConnection(connection, ctx) {
  if (connection.provider === 'notion') { const profile = await notionRequest('users/me', ctx, connection); return { label: profile.name || profile.bot?.workspace_name || 'Notion' }; }
  if (connection.provider === 'classroom') { const token = await accessToken(connection, ctx); const p = await publicJson('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token}` } }); return { label: p.email || 'Google Classroom' }; }
  if (connection.provider === 'teams') { const token = await accessToken(connection, ctx); const p = await publicJson('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', { headers: { Authorization: `Bearer ${token}` } }); return { label: p.mail || p.userPrincipalName || p.displayName }; }
  return { label: connection.name };
}
