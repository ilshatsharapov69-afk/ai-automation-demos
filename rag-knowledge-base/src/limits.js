// Two budgets for the generated answers: per visitor per hour, and per day for everyone.
// Both are one atomic UPSERT: the counter only moves while it is below the limit.

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

export const hourOf = (now) => Math.floor(now / 3_600_000);
export const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

async function bump(db, table, keyCol, key, limit) {
  const r = await db
    .prepare(`INSERT INTO ${table} (${keyCol}, n) VALUES (?, 1) ON CONFLICT(${keyCol}) DO UPDATE SET n = n + 1 WHERE n < ?`)
    .bind(key, limit)
    .run();
  return r.meta.changes > 0;
}

async function read(db, table, keyCol, key) {
  const row = await db.prepare(`SELECT n FROM ${table} WHERE ${keyCol} = ?`).bind(key).first();
  return row ? Number(row.n) : 0;
}

/**
 * Try to spend one generated answer.
 * @returns {{ok: boolean, reason?: 'ip'|'global', ipLeft: number, dayLeft: number}}
 */
export async function spend(db, { ipHash, now, perIp, daily }) {
  const ipKey = `${ipHash}:${hourOf(now)}`;
  const day = dayOf(now);
  if (!(await bump(db, 'rate_limits', 'key', ipKey, perIp))) {
    return { ok: false, reason: 'ip', ipLeft: 0, dayLeft: Math.max(0, daily - (await read(db, 'usage', 'day', day))) };
  }
  if (!(await bump(db, 'usage', 'day', day, daily))) {
    // Give the visitor's slot back: the day is spent, not the visitor.
    await db.prepare('UPDATE rate_limits SET n = n - 1 WHERE key = ? AND n > 0').bind(ipKey).run();
    return { ok: false, reason: 'global', ipLeft: perIp - (await read(db, 'rate_limits', 'key', ipKey)), dayLeft: 0 };
  }
  return {
    ok: true,
    ipLeft: perIp - (await read(db, 'rate_limits', 'key', ipKey)),
    dayLeft: daily - (await read(db, 'usage', 'day', day)),
  };
}

/** Read-only view of what is left. */
export async function peek(db, { ipHash, now, perIp, daily }) {
  return {
    ipLeft: Math.max(0, perIp - (await read(db, 'rate_limits', 'key', `${ipHash}:${hourOf(now)}`))),
    dayLeft: Math.max(0, daily - (await read(db, 'usage', 'day', dayOf(now)))),
  };
}
