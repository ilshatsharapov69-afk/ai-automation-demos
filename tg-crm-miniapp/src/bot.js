// Bot side: Telegram webhook updates, reminder pings and the daily digest (Cron Trigger).
import { ensureMember, findMember, isDemo, wsFor, newInviteCode, buildDigest, createLead, localDay, iso } from './crm.js';
import { seedWorkspace, dropWorkspace } from './seed.js';
import { t, pickLang, COMPANY } from './i18n.js';

/** Telegram Bot API caller. Tests pass env.TG_OUTBOX (an array): calls are recorded there, nothing leaves the process. */
export function makeTg(env) {
  return async function tg(method, payload) {
    if (Array.isArray(env.TG_OUTBOX)) {
      env.TG_OUTBOX.push({ method, ...payload });
      return { ok: true, result: { message_id: env.TG_OUTBOX.length } };
    }
    if (!env.BOT_TOKEN) return { ok: false, description: 'BOT_TOKEN is not set' };
    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({ ok: false }));
    if (!j.ok) console.error('tg', method, r.status, JSON.stringify(j).slice(0, 300));
    return j;
  };
}

const appButton = (appUrl, text, hash = '') => (appUrl ? { inline_keyboard: [[{ text, web_app: { url: `${appUrl}/${hash}` } }]] } : undefined);

export async function handleUpdate(update, { env, tg, appUrl, now = Date.now() }) {
  const msg = update.message;
  if (!msg || !msg.from || msg.chat?.type !== 'private' || typeof msg.text !== 'string') return;
  const user = msg.from;
  const [cmdRaw, ...restParts] = msg.text.trim().split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/@.*$/, '');
  const arg = msg.text.trim().slice(cmdRaw.length).trim();
  const send = (text, reply_markup) => tg('sendMessage', { chat_id: msg.chat.id, text, ...(reply_markup ? { reply_markup } : {}) });

  const joinCode = cmd === '/start' && /^join_[a-z0-9]{6,20}$/.test(restParts[0] || '') ? restParts[0].slice(5) : null;
  const existed = await findMember(env, user.id);
  const me = await ensureMember(env, user, { joinCode, now });
  if (!me) return send(joinCode ? t(pickLang(user.language_code)).badInvite : t(pickLang(user.language_code)).noAccess);
  const T = t(me.lang);
  const open = appButton(appUrl, T.open);

  if (joinCode && !existed) return send(T.joined(COMPANY[me.lang] || COMPANY.en), open);

  switch (cmd) {
    case '/start':
    case '/help':
      return send(T.start(user.first_name || me.name, isDemo(env)), open);
    case '/digest': {
      const d = await buildDigest(env, me, now);
      return send(d.text, open);
    }
    case '/today': {
      const { end } = localDay(now, me.tz_offset);
      const nowIso = iso(now);
      const { results } = await env.DB.prepare(
        'SELECT r.text, r.due_at, l.name, l.company FROM reminders r JOIN leads l ON l.id = r.lead_id WHERE r.member_id = ? AND r.done = 0 AND r.due_at < ? ORDER BY r.due_at',
      ).bind(me.id, end).all();
      if (!results.length) return send(T.todayNone, open);
      const lines = results.map((r) => {
        const hhmm = new Date(Date.parse(r.due_at) + me.tz_offset * 60000).toISOString().slice(11, 16);
        return `${r.due_at < nowIso ? '⚠️' : '•'} ${hhmm} ${r.text} (${r.company || r.name})`;
      });
      return send(`${T.todayHead}\n${lines.join('\n')}`, open);
    }
    case '/new': {
      if (!arg) return send(T.newUsage);
      const [name, company, phone] = arg.split(',').map((s) => s.trim());
      const { lead } = await createLead(env, me, { name: name.slice(0, 120), company: company || null, phone: phone || null, source: 'telegram' }, now);
      return send(T.newDone(lead.id, lead.name), appButton(appUrl, T.openLead, `#/lead/${lead.id}`));
    }
    case '/lang': {
      const lang = me.lang === 'ru' ? 'en' : 'ru';
      await env.DB.prepare('UPDATE members SET lang = ? WHERE id = ?').bind(lang, me.id).run();
      return send(t(lang).lang, appButton(appUrl, t(lang).open));
    }
    case '/reset': {
      if (!isDemo(env)) return send(T.resetOff);
      await seedWorkspace(env.DB, wsFor(env, user.id), user, me.lang, now);
      return send(T.reset, open);
    }
    case '/invite': {
      if (me.role !== 'admin') return send(T.adminOnly);
      const code = await newInviteCode(env, me);
      const bot = env.BOT_USERNAME || (await tg('getMe', {}))?.result?.username || 'your_bot';
      return send(T.invite(`https://t.me/${bot}?start=join_${code}`));
    }
    default:
      return send(T.unknown, open);
  }
}

/** Cron: ping members about due reminders, and send the daily digest at DIGEST_HOUR local time. */
export async function runCron(env, { tg, appUrl, now = Date.now() }) {
  const sent = { reminders: 0, digests: 0, dropped: 0 };
  const { results: due } = await env.DB.prepare(
    `SELECT r.id, r.text, r.lead_id, l.name AS lead_name, l.company, m.tg_id, m.lang
     FROM reminders r JOIN leads l ON l.id = r.lead_id JOIN members m ON m.id = r.member_id
     WHERE r.done = 0 AND r.sent_at IS NULL AND r.due_at <= ? ORDER BY r.due_at LIMIT 100`,
  ).bind(iso(now)).all();
  for (const r of due) {
    if (r.tg_id) {
      const T = t(r.lang);
      await tg('sendMessage', {
        chat_id: r.tg_id,
        text: T.reminder(r.text, r.company ? `${r.lead_name}, ${r.company}` : r.lead_name),
        ...(appUrl ? { reply_markup: appButton(appUrl, T.openLead, `#/lead/${r.lead_id}`) } : {}),
      });
      sent.reminders++;
    }
    await env.DB.prepare('UPDATE reminders SET sent_at = ? WHERE id = ?').bind(iso(now), r.id).run();
  }

  const hour = Number(env.DIGEST_HOUR ?? 9);
  const { results: members } = await env.DB.prepare(
    'SELECT * FROM members WHERE tg_id IS NOT NULL AND digest_on = 1 AND last_seen >= ? LIMIT 500',
  ).bind(iso(now - 7 * 86400000)).all();
  for (const m of members) {
    const { day, localHour } = localDay(now, m.tz_offset);
    if (localHour !== hour || m.last_digest === day) continue;
    const d = await buildDigest(env, m, now);
    await tg('sendMessage', { chat_id: m.tg_id, text: d.text, ...(appUrl ? { reply_markup: appButton(appUrl, t(m.lang).open) } : {}) });
    await env.DB.prepare('UPDATE members SET last_digest = ? WHERE id = ?').bind(day, m.id).run();
    sent.digests++;
  }

  // Demo hygiene: sandboxes of visitors not seen for 30 days are removed (they get a fresh one if they come back).
  if (isDemo(env)) {
    const { results: idle } = await env.DB.prepare(
      "SELECT workspace_id FROM members WHERE tg_id IS NOT NULL AND workspace_id LIKE 'demo-%' AND last_seen < ? LIMIT 20",
    ).bind(iso(now - 30 * 86400000)).all();
    for (const { workspace_id } of idle) await dropWorkspace(env.DB, workspace_id);
    sent.dropped = idle.length;
  }
  return sent;
}
