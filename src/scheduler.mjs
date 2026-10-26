import { randomUUID } from 'node:crypto';
import { AppError, nextRun } from './core.mjs';

export function createScheduler(ctx) {
  const locks = new Set(); let timer, stopping = false;
  async function sync(connectionId, userId) {
    const c = ctx.store.get('SELECT * FROM connections WHERE id=? AND user_id=?', connectionId, userId);
    if (!c) throw new AppError(404, '연결을 찾을 수 없습니다.');
    if (locks.has(c.id)) throw new AppError(409, '이미 갱신 중입니다.');
    const plugin = ctx.registry.get(c.provider); if (!plugin) throw new AppError(400, '등록되지 않은 서비스입니다.');
    if (plugin.passive) return { status: 'passive', message: '이 연결은 수신 API로 새 일정을 기다립니다.' };
    const id = randomUUID(); locks.add(c.id);
    ctx.store.run('INSERT INTO jobs(id,user_id,connection_id,status,started_at) VALUES(?,?,?,?,?)', id, userId, c.id, 'running', new Date().toISOString());
    ctx.store.run("UPDATE connections SET status='syncing',error=NULL WHERE id=?", c.id);
    // External work is awaited outside a SQLite transaction; a failed provider cannot delete old tasks.
    try {
      const counts = plugin.push ? await plugin.push(c, ctx) : ctx.store.ingest(userId, c, await plugin.pull(c, ctx));
      const now = new Date().toISOString();
      ctx.store.run("UPDATE connections SET status='connected',last_sync=?,next_run=?,error=NULL WHERE id=?", now, nextRun(c.interval_minutes), c.id);
      ctx.store.run("UPDATE jobs SET status='succeeded',counts=?,finished_at=? WHERE id=?", JSON.stringify(counts), now, id);
      if (counts.created || counts.updated) ctx.store.event(userId, `${c.name}: 새 항목 ${counts.created}건 · 변경 ${counts.updated}건`);
      return { jobId: id, status: 'succeeded', counts };
    } catch (e) {
      const message = e instanceof AppError ? e.message : '연결 서비스에서 오류가 발생했습니다. 기존 일정은 유지됩니다.';
      ctx.store.run("UPDATE connections SET status='error',error=?,next_run=? WHERE id=?", message, nextRun(Math.min(c.interval_minutes, 30)), c.id);
      ctx.store.run("UPDATE jobs SET status='failed',error=?,finished_at=? WHERE id=?", message, new Date().toISOString(), id);
      ctx.store.event(userId, `${c.name}: ${message}`); throw new AppError(424, message);
    } finally { locks.delete(c.id); }
  }
  let ticking = false;
  async function tick() {
    if (stopping || ticking) return; ticking = true;
    try { const due = ctx.store.all("SELECT * FROM connections WHERE enabled=1 AND provider NOT IN ('manual','webhook','desktop-bridge') AND next_run<=? ORDER BY CASE WHEN provider='notion' THEN 1 ELSE 0 END,next_run", new Date().toISOString());
      for (const c of due) { if (stopping) break; if (!ctx.store.get('SELECT enabled FROM connections WHERE id=?', c.id)?.enabled) continue; try { await sync(c.id, c.user_id); } catch { /* Persisted in jobs and visible in the user's activity. */ } }
    } finally { ticking = false; }
  }
  return { sync, tick, start() { timer = setInterval(tick, 30000); timer.unref(); }, async stop() { stopping = true; clearInterval(timer); const deadline = Date.now() + 25000; while (locks.size && Date.now() < deadline) await new Promise(r => setTimeout(r, 50)); }, isRunning: id => locks.has(id) };
}
