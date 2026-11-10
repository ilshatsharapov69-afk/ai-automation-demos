// D1 access: users, workspace settings, posts and the publishing queue.
import { slotsOf, nextSlot, parseTz, DAY, HOUR, dayStart, fromLocal, local } from './time.js';
import { DEMO_TITLE, pickLang } from './i18n.js';
import { SEED } from './seed.js';

export const isDemo = (env) => String(env.DEMO_MODE || 'on').toLowerCase() !== 'off';
export const ownerIds = (env) => String(env.OWNER_IDS || '').split(/[\s,]+/).filter(Boolean).map(Number);
/** In demo mode everyone manages their own sandbox; in live mode only OWNER_IDS do. */
export const isManager = (env, userId) => isDemo(env) || ownerIds(env).includes(Number(userId));
export const wsOf = (env, userId) => (isDemo(env) ? `u${userId}` : 'main');
export const aiLimit = (env) => Math.max(0, Number(env.AI_DAILY_LIMIT ?? 20) || 0);

// ---------- users ----------

export async function getUser(env, from, now) {
  let u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(from.id).first();
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(from.id);
  if (!u) {
    u = { id: from.id, lang: pickLang(from.language_code), name, username: from.username || null, state: null, created_at: now, updated_at: now, isNew: true };
    await env.DB.prepare('INSERT INTO users (id, lang, name, username, state, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?)')
      .bind(u.id, u.lang, u.name, u.username, now, now).run();
  } else if (u.name !== name || (u.username || null) !== (from.username || null)) {
    await env.DB.prepare('UPDATE users SET name = ?, username = ?, updated_at = ? WHERE id = ?').bind(name, from.username || null, now, from.id).run();
    u = { ...u, name, username: from.username || null };
  }
  return u;
}

export const getState = (u) => { try { return u.state ? JSON.parse(u.state) : null; } catch { return null; } };
export async function setState(env, userId, state) {
  await env.DB.prepare('UPDATE users SET state = ? WHERE id = ?').bind(state ? JSON.stringify(state) : null, userId).run();
}
export async function setLang(env, userId, lang) {
  await env.DB.prepare('UPDATE users SET lang = ? WHERE id = ?').bind(lang, userId).run();
}

// ---------- settings ----------

export async function getSettings(env, ws, { lang = 'en', now = Date.now() } = {}) {
  let s = await env.DB.prepare('SELECT * FROM settings WHERE ws = ?').bind(ws).first();
  if (!s) {
    const demo = ws !== 'main';
    s = {
      ws,
      title: demo ? DEMO_TITLE[lang] || DEMO_TITLE.en : String(env.CHANNEL_TITLE || 'My channel'),
      channel_id: null,
      slots: slotsOf(env.DEFAULT_SLOTS || '09:00,13:00,19:00').join(','),
      tz: parseTz(env.TZ_OFFSET ?? '0') ?? 0,
      ai_day: null,
      ai_used: 0,
      created_at: now,
    };
    await env.DB.prepare('INSERT OR IGNORE INTO settings (ws, title, channel_id, slots, tz, ai_day, ai_used, created_at) VALUES (?, ?, NULL, ?, ?, NULL, 0, ?)')
      .bind(s.ws, s.title, s.slots, s.tz, now).run();
    if (demo) await seedSandbox(env, ws, Number(ws.slice(1)), lang, now, s);
  }
  return { ...s, slotList: slotsOf(s.slots) };
}

export async function updateSettings(env, ws, patch) {
  const keys = Object.keys(patch).filter((k) => ['title', 'channel_id', 'slots', 'tz', 'ai_day', 'ai_used'].includes(k));
  if (!keys.length) return;
  await env.DB.prepare(`UPDATE settings SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ws = ?`).bind(...keys.map((k) => patch[k]), ws).run();
}

/** Daily AI budget per workspace. Returns true and counts one use if there is budget left. */
export async function takeAiBudget(env, s, today) {
  const used = s.ai_day === today ? s.ai_used : 0;
  if (used >= aiLimit(env)) return false;
  await updateSettings(env, s.ws, { ai_day: today, ai_used: used + 1 });
  s.ai_day = today; s.ai_used = used + 1;
  return true;
}

// ---------- posts ----------

export const getPost = (env, id) => env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(Number(id) || 0).first();

export async function createPost(env, p, now) {
  const r = await env.DB.prepare(
    'INSERT INTO posts (ws, author_id, text, entities, photo, source, topic, variant, status, scheduled_at, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(p.ws, p.author_id, p.text || '', p.entities ? JSON.stringify(p.entities) : null, p.photo || null, p.source || 'manual', p.topic || null,
    p.variant || 0, p.status || 'draft', p.scheduled_at ?? null, p.published_at ?? null, p.created_at ?? now, now).run();
  return getPost(env, r.meta.last_row_id);
}

export async function updatePost(env, id, patch, now) {
  const keys = Object.keys(patch);
  const vals = keys.map((k) => (k === 'entities' && patch[k] && typeof patch[k] !== 'string' ? JSON.stringify(patch[k]) : patch[k]));
  await env.DB.prepare(`UPDATE posts SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).bind(...vals, now, id).run();
  return getPost(env, id);
}

export const deletePost = (env, id) => env.DB.prepare("DELETE FROM posts WHERE id = ? AND status != 'published'").bind(id).run();

/** Times already held by scheduled posts of this workspace. */
export async function takenTimes(env, ws, exceptId = 0) {
  const { results } = await env.DB.prepare("SELECT scheduled_at FROM posts WHERE ws = ? AND status IN ('approved','publishing','failed') AND scheduled_at IS NOT NULL AND id != ?").bind(ws, exceptId).all();
  return new Set(results.map((r) => r.scheduled_at));
}

export async function approveToNextSlot(env, post, s, now) {
  const at = nextSlot(now, s.slotList, s.tz, await takenTimes(env, post.ws, post.id));
  if (!at) return null;
  return updatePost(env, post.id, { status: 'approved', scheduled_at: at, error: null }, now);
}

export async function queueOf(env, ws) {
  const { results: scheduled } = await env.DB.prepare("SELECT * FROM posts WHERE ws = ? AND status IN ('approved','failed','publishing') ORDER BY scheduled_at, id LIMIT 30").bind(ws).all();
  const { results: drafts } = await env.DB.prepare("SELECT * FROM posts WHERE ws = ? AND status = 'draft' ORDER BY id DESC LIMIT 15").bind(ws).all();
  return { scheduled, drafts };
}

/** Atomically take a post for publishing, so the cron and a "Publish now" press never send it twice. */
export async function claimForPublish(env, id, now) {
  const r = await env.DB.prepare("UPDATE posts SET status = 'publishing', updated_at = ? WHERE id = ? AND status IN ('approved','failed')").bind(now, id).run();
  return r.meta.changes === 1;
}

export async function duePosts(env, now, limit = 25) {
  const { results } = await env.DB.prepare("SELECT * FROM posts WHERE status = 'approved' AND scheduled_at <= ? ORDER BY scheduled_at, id LIMIT ?").bind(now, limit).all();
  return results;
}

/** Posts stuck in 'publishing' (Worker died mid-send) are released after 10 minutes as failed, never re-sent blindly. */
export async function releaseStuck(env, now) {
  const r = await env.DB.prepare("UPDATE posts SET status = 'failed', error = 'interrupted', updated_at = ? WHERE status = 'publishing' AND updated_at < ?").bind(now, now - 10 * 60_000).run();
  return r.meta.changes;
}

// ---------- stats ----------

export async function statsOf(env, ws, s, now) {
  const tz = s.tz;
  const one = (sql, ...a) => env.DB.prepare(sql).bind(ws, ...a).first();
  const pub = await one(
    "SELECT COUNT(*) AS total, SUM(photo IS NOT NULL) AS photo, SUM(source IN ('ai','stub')) AS ai, AVG(LENGTH(text)) AS avg_len, MAX(published_at) AS last_at FROM posts WHERE ws = ? AND status = 'published'",
  );
  const start = dayStart(now, tz) - 6 * DAY;
  const { results: days } = await env.DB.prepare("SELECT published_at FROM posts WHERE ws = ? AND status = 'published' AND published_at >= ?").bind(ws, start).all();
  const perDay = Array.from({ length: 7 }, (_, i) => ({ at: start + i * DAY, n: 0 }));
  for (const r of days) { const i = Math.floor((dayStart(r.published_at, tz) - start) / DAY); if (perDay[i]) perDay[i].n++; }
  const q = await one("SELECT COUNT(*) AS n, MIN(scheduled_at) AS next_at, MAX(scheduled_at) AS last_at FROM posts WHERE ws = ? AND status = 'approved'");
  const drafts = await one("SELECT COUNT(*) AS n FROM posts WHERE ws = ? AND status = 'draft'");
  const failed = await one("SELECT COUNT(*) AS n FROM posts WHERE ws = ? AND status = 'failed'");
  const subs = await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE ws = ? AND status = 'active' AND expires_at > ?").bind(ws, now).first();
  const { results: rev } = await env.DB.prepare("SELECT currency, SUM(amount) AS sum FROM payments WHERE ws = ? AND status = 'paid' GROUP BY currency").bind(ws).all();
  const total = pub.total || 0;
  return {
    total,
    week: days.length,
    perDay,
    photo: pub.photo || 0,
    text: total - (pub.photo || 0),
    ai: pub.ai || 0,
    manual: total - (pub.ai || 0),
    avgLen: Math.round(pub.avg_len || 0),
    lastAt: pub.last_at || null,
    queued: q.n || 0,
    nextAt: q.next_at || null,
    coverUntil: q.last_at || null,
    drafts: drafts.n || 0,
    failed: failed.n || 0,
    subs: subs.n || 0,
    revenue: rev,
  };
}

// ---------- demo sandbox ----------

/** Fictional channel history so the queue, the cron and the stats look alive from the first minute. */
export async function seedSandbox(env, ws, userId, lang, now, s) {
  const L = SEED[lang === 'ru' ? 'ru' : 'en'];
  const tz = s.tz;
  const slots = slotsOf(s.slots);
  const stmts = [];
  const ins = (p) => env.DB.prepare(
    'INSERT INTO posts (ws, author_id, text, photo, source, topic, status, scheduled_at, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(ws, userId, p.text, p.photo || null, p.source, p.topic || null, p.status, p.at ?? null, p.status === 'published' ? p.at : null, p.created ?? now, now);
  // History: published posts on the last 6 days, 1-3 a day, at the slot times.
  const pattern = [2, 1, 3, 2, 1, 2];
  let k = 0;
  for (let d = 6; d >= 1; d--) {
    const p = local(dayStart(now, tz) - d * DAY + 12 * HOUR, tz);
    for (let j = 0; j < pattern[6 - d]; j++) {
      const [hh, mm] = slots[j % slots.length].split(':').map(Number);
      const at = fromLocal(p.y, p.m, p.d, hh, mm, tz);
      const src = L.published[k++ % L.published.length];
      stmts.push(ins({ ...src, status: 'published', at, created: at - DAY }));
    }
  }
  // Upcoming: two approved posts at the next free slots, one draft waiting.
  const taken = new Set();
  for (const src of L.upcoming) {
    const at = nextSlot(now, slots, tz, taken);
    taken.add(at);
    stmts.push(ins({ ...src, status: 'approved', at }));
  }
  for (const src of L.drafts) stmts.push(ins({ ...src, status: 'draft' }));
  await env.DB.batch(stmts);
}

export async function resetSandbox(env, ws) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM posts WHERE ws = ?').bind(ws),
    env.DB.prepare('DELETE FROM settings WHERE ws = ?').bind(ws),
    env.DB.prepare('DELETE FROM payments WHERE ws = ?').bind(ws),
    env.DB.prepare('DELETE FROM subscriptions WHERE ws = ?').bind(ws),
  ]);
}
