import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { encrypt, decrypt } from './security.mjs';
import { normalizeTask, stableKey, nextRun } from './core.mjs';

export function openStore(cfg) {
  const db = new DatabaseSync(path.join(cfg.dataDir, 'chunggwak.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT, role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),provider TEXT NOT NULL,name TEXT NOT NULL,config TEXT NOT NULL DEFAULT '{}',secret TEXT,enabled INTEGER NOT NULL DEFAULT 1,interval_minutes INTEGER NOT NULL DEFAULT 720,next_run TEXT,last_sync TEXT,status TEXT NOT NULL DEFAULT 'pending',error TEXT,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS connection_user ON connections(user_id);
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),connection_id TEXT NOT NULL REFERENCES connections(id),external_key TEXT NOT NULL,external_id TEXT NOT NULL,data TEXT NOT NULL,progress TEXT NOT NULL DEFAULT 'unknown',personal_note TEXT NOT NULL DEFAULT '',notion_page_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,connection_id,external_key));
    CREATE INDEX IF NOT EXISTS task_user ON tasks(user_id);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),connection_id TEXT NOT NULL REFERENCES connections(id),status TEXT NOT NULL,counts TEXT,error TEXT,started_at TEXT NOT NULL,finished_at TEXT);
    CREATE INDEX IF NOT EXISTS jobs_user ON jobs(user_id,started_at);
    CREATE TABLE IF NOT EXISTS api_keys(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),hash TEXT NOT NULL UNIQUE,name TEXT NOT NULL,scopes TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_states(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),provider TEXT NOT NULL,secret TEXT NOT NULL,expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL);
  `);
  if (!db.prepare('PRAGMA table_info(tasks)').all().some(c => c.name === 'last_seen_at')) db.exec('ALTER TABLE tasks ADD COLUMN last_seen_at TEXT');
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  // An interrupted sync can be retried after restart; no external success is inferred.
  run("UPDATE jobs SET status='interrupted',error='프로그램이 다시 시작되어 중단된 갱신입니다.',finished_at=? WHERE status='running'", new Date().toISOString());
  const secretFor = connection => decrypt(cfg.masterKey, connection.secret);
  const setSecret = (id, value) => run('UPDATE connections SET secret=? WHERE id=?', encrypt(cfg.masterKey, value), id);
  const listTasks = user => all('SELECT * FROM tasks WHERE user_id=? ORDER BY updated_at DESC', user).map(row => ({ ...JSON.parse(row.data), id: row.id, connectionId: row.connection_id, progress: row.progress, personalNote: row.personal_note, notionPageId: row.notion_page_id, createdAt: row.created_at, updatedAt: row.updated_at, lastSeenAt: row.last_seen_at || row.updated_at }));
  function upsert(user, connection, input) {
    const value = normalizeTask(input, connection.provider === 'desktop-bridge' ? input.source || 'bridge' : connection.provider);
    const key = stableKey(value); let old = get('SELECT * FROM tasks WHERE user_id=? AND connection_id=? AND external_key=?', user, connection.id, key);
    if (!old) {
      const candidates = all("SELECT t.* FROM tasks t JOIN connections c ON c.id=t.connection_id WHERE t.user_id=? AND t.external_key=? AND (c.provider='desktop-bridge' OR ?='desktop-bridge')", user, key, connection.provider);
      if (candidates.length === 1) old = candidates[0];
    }
    if (!old && value.originRef) {
      const candidates = all("SELECT * FROM tasks WHERE user_id=? AND json_extract(data,'$.originRef')=? AND json_extract(data,'$.source')=?", user, value.originRef, value.source);
      if (candidates.length === 1) old = candidates[0];
    }
    if (old && !value.originRef) value.originRef = JSON.parse(old.data).originRef || '';
    const now = new Date().toISOString();
    const data = JSON.stringify(value);
    if (old) { if (old.data === data) { run('UPDATE tasks SET last_seen_at=? WHERE id=? AND user_id=?', now, old.id, user); return { state: 'unchanged', id: old.id }; }
      const target = connection.provider === 'desktop-bridge' ? old.connection_id : connection.id;
      run('UPDATE tasks SET data=?,connection_id=?,external_key=?,external_id=?,updated_at=?,last_seen_at=? WHERE id=? AND user_id=?', data, target, key, value.externalId, now, now, old.id, user); return { state: 'updated', id: old.id };
    }
    const id = randomUUID(); run('INSERT INTO tasks(id,user_id,connection_id,external_key,external_id,data,created_at,updated_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?)', id, user, connection.id, key, value.externalId, data, now, now, now); return { state: 'created', id };
  }
  function ingest(user, connection, inputs) {
    const normalized = inputs.map(x => normalizeTask(x, connection.provider === 'desktop-bridge' ? x.source || 'bridge' : connection.provider));
    const counts = { created: 0, updated: 0, unchanged: 0 };
    db.exec('BEGIN IMMEDIATE'); try { for (const item of normalized) counts[upsert(user, connection, item).state]++; db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
    return counts;
  }
  function connection(user, provider, name, config = {}, secret = {}, status = 'connected') {
    const id = randomUUID(), now = new Date().toISOString();
    run('INSERT INTO connections(id,user_id,provider,name,config,secret,next_run,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)', id, user, provider, name, JSON.stringify(config), encrypt(cfg.masterKey, secret), nextRun(1), status, now);
    return get('SELECT * FROM connections WHERE id=?', id);
  }
  const event = (user, message) => run('INSERT INTO events(user_id,message,created_at) VALUES(?,?,?)', user, message, new Date().toISOString());
  return { db, get, all, run, secretFor, setSecret, listTasks, upsert, ingest, connection, event, close: () => db.close() };
}
