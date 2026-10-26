import { createHash } from 'node:crypto';

export class AppError extends Error {
  constructor(status, message, code = 'request_error') { super(message); this.status = status; this.code = code; }
}
export function text(value, max = 1000) { return String(value ?? '').trim().slice(0, max); }
export function cleanHtml(value) {
  return text(value, 30000).replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\r/g, '').trim();
}
export function oneSentence(title, description) {
  const plain = cleanHtml(description).replace(/https?:\/\/\S+/g, '').split(/\n|(?<=[.!?。])\s/).map(x => x.replace(/^[\s•*\-\d.)]+/, '').trim()).find(x => x.length > 8);
  if (!plain) return `${text(title, 170)}의 원문 안내와 첨부자료 확인하기.`;
  return plain.length > 210 ? `${plain.slice(0, 207)}…` : plain;
}
export function kstDay(date = new Date()) { return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10); }
export function deadlineMs(due) {
  if (!due) return null;
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(due) ? `${due}T23:59:59.999+09:00` : due);
}
export function isActive(item, now = new Date()) {
  return item.kind !== 'material' && item.status !== 'submitted' && item.progress !== 'done' && (!item.dueAt || deadlineMs(item.dueAt) >= now.getTime());
}
export function safeLink(url) {
  if (!url) return '';
  try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function canonicalUrl(url) {
  try { const u = new URL(url); u.pathname = u.pathname.replace(/\/u\/\d+\//, '/u/0/'); u.search = ''; u.hash = ''; return u.href; } catch { return ''; }
}
export function normalizeTask(input, provider = 'manual') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError(400, '일정 형식을 확인해 주세요.');
  if (!/^[a-z][a-z0-9-]{0,50}$/.test(provider)) throw new AppError(400, '서비스 식별자 형식을 확인해 주세요.');
  const title = text(input.title, 300); if (!title) throw new AppError(400, '일정 제목이 필요합니다.');
  const dueAt = text(input.dueAt, 50) || null;
  if (dueAt && (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}.*)?$/.test(dueAt) || !Number.isFinite(deadlineMs(dueAt)))) throw new AppError(400, '마감일 형식을 확인해 주세요.');
  const course = text(input.course, 250);
  const kind = provider === 'classroom' && !dueAt ? 'material' : ['task', 'material', 'notice'].includes(input.kind) ? input.kind : 'task';
  const url = safeLink(input.url);
  const externalId = text(input.externalId, 500) || canonicalUrl(url);
  if (!externalId) throw new AppError(400, '중복을 구분할 원본 ID 또는 원문 링크가 필요합니다.');
  const attachments = (Array.isArray(input.attachments) ? input.attachments : []).slice(0, 60).map(a => ({ name: text(a.name, 500), url: safeLink(a.url) })).filter(a => a.name);
  const status = ['submitted', 'assigned', 'unknown'].includes(input.status) ? input.status : 'unknown';
  const description = cleanHtml(input.description);
  return { externalId, courseId: text(input.courseId, 500) || course, title, course, kind, dueAt, status,
    summary: text(input.summary, 1000) || oneSentence(title, description), description, attachments, url,
    source: provider, originRef: text(input.originRef, 500), verifiedAt: text(input.verifiedAt, 50) || null, sourceUpdatedAt: text(input.sourceUpdatedAt, 50) || null };
}
export function stableKey(t) { return createHash('sha256').update(JSON.stringify([t.source, t.courseId, t.externalId])).digest('hex'); }
export function nextRun(intervalMinutes = 720, now = Date.now()) { return new Date(now + intervalMinutes * 60000).toISOString(); }
export function getPath(obj, path) {
  if (!path) return obj;
  const parts = String(path).split('.'); if (parts.some(x => ['__proto__', 'prototype', 'constructor'].includes(x))) return undefined;
  return parts.reduce((a, key) => a && Object.hasOwn(a, key) ? a[key] : undefined, obj);
}
export function mapFeed(items, mapping = {}) {
  const defaults = { externalId: 'id', title: 'title', course: 'course', courseId: 'courseId', description: 'description', summary: 'summary', dueAt: 'dueAt', status: 'status', kind: 'kind', url: 'url', attachments: 'attachments' };
  return items.map(item => Object.fromEntries(Object.entries({ ...defaults, ...mapping }).map(([k, v]) => [k, getPath(item, v)])));
}
