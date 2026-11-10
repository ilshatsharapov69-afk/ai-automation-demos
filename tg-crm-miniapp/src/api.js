// JSON API for the Mini App. Every request carries `Authorization: tma <initData>`; the user comes only from
// validated initData, never from the request body.
import { validateInitData } from './auth.js';
import * as crm from './crm.js';
import { STATUSES, SOURCES, COMPANY } from './i18n.js';
import { makeTg } from './bot.js';
import { seedWorkspace } from './seed.js';
import { issueSession, verifySession, readCookie, setCookieHeader, browserUser } from './session.js';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

const publicMe = (m) => ({ id: m.id, name: m.name, username: m.username, role: m.role, lang: m.lang, tz_offset: m.tz_offset, digest_on: !!m.digest_on });

// Two ways in:
//  1. Telegram: `Authorization: tma <initData>`, checked against BOT_TOKEN (any invalid initData is a 401).
//  2. Browser demo: no initData (or no BOT_TOKEN configured) -> a signed "sb" cookie names a private sandbox.
//     A request without a valid cookie gets a fresh sandbox and a new cookie in the response.
// Returns { me, browser, newCookie }.
async function authenticate(req, env, now) {
  const header = req.headers.get('Authorization') || '';
  const initData = header.startsWith('tma ') ? header.slice(4).trim() : '';
  if (initData && env.BOT_TOKEN) {
    const v = await validateInitData(initData, env.BOT_TOKEN, { maxAgeSec: Number(env.INIT_DATA_MAX_AGE || 86400), now });
    if (!v.ok) throw new crm.HttpError(401, `initData: ${v.error}`);
    const join = /^join_([a-z0-9]{6,20})$/.exec(v.startParam || '');
    const me = await crm.ensureMember(env, v.user, { joinCode: join ? join[1] : null, now });
    if (!me) throw new crm.HttpError(403, 'not a member of this team');
    return { me, browser: false, newCookie: null };
  }
  if (!crm.isDemo(env)) throw new crm.HttpError(401, 'initData: missing');
  if (!env.SESSION_SECRET) throw new crm.HttpError(503, 'browser demo is not configured (SESSION_SECRET)');
  let id = await verifySession(readCookie(req), env.SESSION_SECRET);
  let newCookie = null;
  if (!id) {
    const s = await issueSession(env.SESSION_SECRET);
    id = s.id;
    newCookie = s.cookie;
  }
  const user = browserUser(id, req.headers.get('Accept-Language') || '');
  if (!(await crm.findMember(env, user.id))) {
    // New sandbox (or one deleted after 7 days): spend a slot, clean up old ones, then ensureMember seeds it.
    await crm.takeSandboxSlot(env, req.headers.get('CF-Connecting-IP') || 'local', now);
    await crm.pruneSandboxes(env, now);
  }
  const me = await crm.ensureMember(env, user, { now });
  return { me, browser: true, newCookie };
}

async function body(req) {
  try {
    return await req.json();
  } catch {
    throw new crm.HttpError(400, 'bad json');
  }
}

export async function handleApi(req, env, { appUrl, now = Date.now() } = {}) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  const m = req.method;
  try {
    const auth = await authenticate(req, env, now);
    const res = await dispatch(req, env, auth, { appUrl, now, url, path, m });
    if (auth.newCookie) res.headers.append('Set-Cookie', setCookieHeader(auth.newCookie, url.protocol === 'https:'));
    return res;
  } catch (e) {
    if (e instanceof crm.HttpError) return json({ error: e.message }, e.status);
    console.error('api', e && e.stack ? e.stack : e);
    return json({ error: 'internal error' }, 500);
  }
}

async function dispatch(req, env, { me, browser }, { appUrl, now, url, path, m }) {
  {
    let r;
    if (path === '/api/me' && m === 'GET') {
      const ws = await env.DB.prepare('SELECT name FROM workspaces WHERE id = ?').bind(me.workspace_id).first();
      return json({
        me: publicMe(me),
        team: await crm.teamOf(env, me.workspace_id),
        workspace: { name: ws?.name || COMPANY.en },
        demo: crm.isDemo(env),
        browser,
        currency: crm.currency(env),
        statuses: STATUSES,
        sources: SOURCES,
      });
    }
    if (path === '/api/me' && m === 'POST') return json({ me: publicMe(await crm.updateMe(env, me, await body(req))) });
    if (path === '/api/leads' && m === 'GET') return json(await crm.listLeads(env, me, Object.fromEntries(url.searchParams), now));
    if (path === '/api/leads' && m === 'POST') return json(await crm.createLead(env, me, await body(req), now), 201);
    if ((r = /^\/api\/leads\/(\d+)$/.exec(path))) {
      if (m === 'GET') return json(await crm.getLead(env, me, r[1]));
      if (m === 'PATCH') return json(await crm.updateLead(env, me, r[1], await body(req), now));
    }
    if ((r = /^\/api\/leads\/(\d+)\/notes$/.exec(path)) && m === 'POST') return json(await crm.addNote(env, me, r[1], await body(req), now), 201);
    if ((r = /^\/api\/leads\/(\d+)\/reminders$/.exec(path)) && m === 'POST') return json(await crm.addReminder(env, me, r[1], await body(req), now), 201);
    if ((r = /^\/api\/reminders\/(\d+)$/.exec(path)) && m === 'PATCH') return json(await crm.updateReminder(env, me, r[1], await body(req)));
    if (path === '/api/reminders' && m === 'GET') return json(await crm.listReminders(env, me, url.searchParams.get('scope') || 'mine', now));
    if (path === '/api/stats' && m === 'GET') return json(await crm.stats(env, me, now));
    if (path === '/api/reset' && m === 'POST') {
      // Demo only: restore the seed data (counts as a new sandbox for the limits).
      if (!crm.isDemo(env)) throw new crm.HttpError(403, 'reset is for the demo only');
      await crm.takeSandboxSlot(env, req.headers.get('CF-Connecting-IP') || 'local', now);
      const user = { id: me.tg_id, first_name: me.name, username: me.username };
      await seedWorkspace(env.DB, me.workspace_id, user, me.lang, now);
      return json({ ok: true });
    }
    if (path === '/api/digest' && m === 'POST') {
      // "Send me the digest now" button: the same message the morning digest would send.
      const d = await crm.buildDigest(env, me, now);
      // A browser visitor has no chat with a bot: show the message the owner would receive in Telegram.
      if (browser || !env.BOT_TOKEN) return json({ sent: false, preview: true, text: d.text, counts: d.counts });
      const tg = makeTg(env);
      const open = appUrl ? { reply_markup: { inline_keyboard: [[{ text: me.lang === 'ru' ? 'Открыть CRM' : 'Open CRM', web_app: { url: `${appUrl}/` } }]] } } : {};
      const sent = await tg('sendMessage', { chat_id: me.tg_id, text: d.text, ...open });
      return json({ sent: !!sent.ok, text: d.text, counts: d.counts });
    }
    return json({ error: 'not found' }, 404);
  }
}
