// Self-refresh without a cron trigger: when the dashboard or /api/summary is requested and the last run is older
// than the interval, the Worker starts a run in ctx.waitUntil. A D1 row is the lock, so two visitors never start two.
import { runMonitor } from './monitor.js';

export const REFRESH_HOURS = 6;
const LOCK_MS = 5 * 60000; // a crashed run frees the lock after 5 minutes

export function refreshMs(env) {
  return Math.max(1, Number(env.REFRESH_HOURS) || REFRESH_HOURS) * 3600000;
}

const lastStart = (db) => db.prepare('SELECT MAX(started_at) AS t FROM runs').first('t');

// Returns the run result, or null when no run was needed or another visitor holds the lock.
export async function maybeRun(env, { now = Date.now(), fetchFn } = {}) {
  const db = env.DB;
  const due = async () => {
    const t = await lastStart(db);
    return t == null || now - t >= refreshMs(env);
  };
  if (!(await due())) return null;
  // Atomic: the row is taken only if it is missing or its lock has expired.
  const got = await db.prepare(`INSERT INTO meta (key, value) VALUES ('lock', ?1)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE meta.value <= ?2 RETURNING value`)
    .bind(now + LOCK_MS, now).first();
  if (!got) return null;
  try {
    if (!(await due())) return null; // another visitor finished a run between our check and our lock
    return await runMonitor(env, { now, trigger: 'lazy', ...(fetchFn ? { fetchFn } : {}) });
  } finally {
    await db.prepare("UPDATE meta SET value = 0 WHERE key = 'lock'").run();
  }
}
