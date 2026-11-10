// Paid access to a private channel: plans -> checkout -> payment confirmed -> one-person invite link -> expiry.
//
// ⚠️ THE PAYMENT IS A MOCK. No card is asked, no money is charged, provider = 'mock' in the payments table.
// The flow is real everywhere else: payment rows, subscriptions, invite links (createChatInviteLink, live mode),
// reminders and removal from the channel at expiry. To take real money, replace the "Pay (mock)" button with a
// Telegram Stars invoice (sendInvoice, currency XTR) or a provider link, and call confirmPayment() from the
// successful_payment update / provider webhook. Nothing else changes. See README.
import { isDemo, ownerIds } from './store.js';
import { fmtWhen, DAY } from './time.js';
import { t } from './i18n.js';

export const PLANS = {
  m1: { days: 30, price: { USD: 5, EUR: 5, RUB: 490 } },
  m3: { days: 90, price: { USD: 12, EUR: 12, RUB: 1190 } },
  y1: { days: 365, price: { USD: 40, EUR: 40, RUB: 3990 } },
};

export const currencyOf = (env) => (PLANS.m1.price[String(env.CURRENCY || 'USD').toUpperCase()] ? String(env.CURRENCY).toUpperCase() : 'USD');

export function fmtPrice(amount, cur) {
  const n = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  if (cur === 'USD') return `$${n}`;
  if (cur === 'EUR') return `€${n}`;
  if (cur === 'RUB') return `${n.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`;
  return `${n} ${cur}`;
}

export const revenueText = (rows, env) => (rows.length ? rows.map((r) => fmtPrice(r.sum, r.currency)).join(' + ') : fmtPrice(0, currencyOf(env)));

const paidChannel = (env) => String(env.PAID_CHANNEL_ID || '').trim();

export function plansMessage(env, T, title) {
  const cur = currencyOf(env);
  return {
    text: T.plansIntro(title),
    reply_markup: { inline_keyboard: Object.entries(PLANS).map(([id, p]) => [{ text: T.planBtn(T.plan[id], fmtPrice(p.price[cur], cur)), callback_data: `buy:${id}` }]) },
  };
}

/** Creates a pending payment and returns the checkout message (edited into the plans message). */
export async function startCheckout(env, { ws, userId, planId, T, now }) {
  const plan = PLANS[planId];
  if (!plan) return null;
  const cur = currencyOf(env);
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  await env.DB.prepare("INSERT INTO payments (id, ws, user_id, plan, amount, currency, provider, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'mock', 'pending', ?)")
    .bind(id, ws, userId, planId, plan.price[cur], cur, now).run();
  const price = fmtPrice(plan.price[cur], cur);
  return {
    id,
    text: T.checkout(T.plan[planId], price),
    reply_markup: { inline_keyboard: [[{ text: T.payBtn(price), callback_data: `mockpay:${id}` }], [{ text: T.btn.cancel, callback_data: `paycancel:${id}` }]] },
  };
}

export async function cancelCheckout(env, id, userId) {
  const r = await env.DB.prepare("UPDATE payments SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'").bind(id, userId).run();
  return r.meta.changes === 1;
}

/**
 * The mock "payment provider": marks the payment paid. Only the payer can confirm their own pending payment,
 * and only once (the UPDATE is conditional), so a double tap does not extend the access twice.
 */
export async function mockPay(env, tg, { id, user, now }) {
  const r = await env.DB.prepare("UPDATE payments SET status = 'paid', paid_at = ? WHERE id = ? AND user_id = ? AND status = 'pending'").bind(now, id, user.id).run();
  if (r.meta.changes !== 1) return null;
  const payment = await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(id).first();
  return confirmPayment(env, tg, { payment, user, now });
}

/** Provider-independent part: extend the subscription, send the invite link, tell the owners. */
export async function confirmPayment(env, tg, { payment, user, now }) {
  const T = t(user.lang);
  const plan = PLANS[payment.plan];
  const cur = await env.DB.prepare('SELECT * FROM subscriptions WHERE ws = ? AND user_id = ?').bind(payment.ws, payment.user_id).first();
  const from = cur && cur.status === 'active' && cur.expires_at > now ? cur.expires_at : now;
  const expires = from + plan.days * DAY;
  await env.DB.prepare(
    `INSERT INTO subscriptions (ws, user_id, plan, status, started_at, expires_at, reminded) VALUES (?, ?, ?, 'active', ?, ?, 0)
     ON CONFLICT (ws, user_id) DO UPDATE SET plan = excluded.plan, status = 'active', expires_at = excluded.expires_at, reminded = 0,
       started_at = CASE WHEN subscriptions.status = 'active' THEN subscriptions.started_at ELSE excluded.started_at END`,
  ).bind(payment.ws, payment.user_id, payment.plan, now, expires).run();

  const until = fmtWhen(expires, 0, user.lang) + ' UTC';
  await tg('sendMessage', { chat_id: user.id, text: T.paid(T.plan[payment.plan], until) });

  let link = null;
  if (isDemo(env)) {
    await tg('sendMessage', { chat_id: user.id, text: T.inviteDemo });
  } else if (!paidChannel(env)) {
    await tg('sendMessage', { chat_id: user.id, text: T.inviteFail('PAID_CHANNEL_ID is not set') });
  } else {
    const r = await tg('createChatInviteLink', { chat_id: paidChannel(env), name: `sub ${user.id}`.slice(0, 32), member_limit: 1, expire_date: Math.floor(now / 1000) + 86400 });
    if (r && r.ok && r.result?.invite_link) {
      link = r.result.invite_link;
      await env.DB.prepare('UPDATE subscriptions SET invite_link = ? WHERE ws = ? AND user_id = ?').bind(link, payment.ws, payment.user_id).run();
      await tg('sendMessage', { chat_id: user.id, text: `${T.inviteReal}\n${link}`, reply_markup: { inline_keyboard: [[{ text: T.inviteBtn, url: link }]] } });
    } else {
      await tg('sendMessage', { chat_id: user.id, text: T.inviteFail(r?.description || 'Telegram error') });
    }
  }
  if (!isDemo(env)) {
    const who = user.username ? `${user.name} (@${user.username})` : `${user.name} (id ${user.id})`;
    for (const owner of ownerIds(env)) {
      const O = t('en');
      await tg('sendMessage', { chat_id: owner, text: O.ownerNewSub(who, O.plan[payment.plan], fmtWhen(expires, 0, 'en') + ' UTC') });
    }
  }
  return { expires, link };
}

export async function statusMessage(env, { ws, user, now }) {
  const T = t(user.lang);
  const s = await env.DB.prepare("SELECT * FROM subscriptions WHERE ws = ? AND user_id = ? AND status = 'active' AND expires_at > ?").bind(ws, user.id, now).first();
  if (!s) return { text: T.noAccess, reply_markup: { inline_keyboard: [[{ text: T.menu.subscribe, callback_data: 'plans' }]] } };
  const rows = [[{ text: T.renewBtn, callback_data: 'plans' }]];
  if (isDemo(env)) rows.push([{ text: T.simulateBtn, callback_data: 'simexpire' }]);
  const days = Math.max(1, Math.ceil((s.expires_at - now) / DAY));
  return { text: T.status(T.plan[s.plan], fmtWhen(s.expires_at, 0, user.lang) + ' UTC', T.daysLeft(days)), reply_markup: { inline_keyboard: rows } };
}

/** Demo button: move the end of the visitor's access to "now" and run the same expiry code as the cron. */
export async function simulateExpiry(env, tg, { ws, user, now }) {
  await env.DB.prepare("UPDATE subscriptions SET expires_at = ? WHERE ws = ? AND user_id = ? AND status = 'active'").bind(now - 1, ws, user.id).run();
  return expireDue(env, tg, now, { ws });
}

/** Cron: a reminder 3 days before the end, and at the end: status expired, member removed from the paid channel. */
export async function expireDue(env, tg, now, { ws, quiet = false } = {}) {
  const where = ws ? ' AND s.ws = ?' : '';
  const args = ws ? [ws] : [];
  const out = { reminded: 0, expired: 0 };
  const { results: soon } = await env.DB.prepare(
    `SELECT s.*, u.lang FROM subscriptions s LEFT JOIN users u ON u.id = s.user_id WHERE s.status = 'active' AND s.reminded = 0 AND s.expires_at > ? AND s.expires_at <= ?${where} LIMIT 50`,
  ).bind(now, now + 3 * DAY, ...args).all();
  for (const s of soon) {
    const T = t(s.lang);
    await env.DB.prepare('UPDATE subscriptions SET reminded = 1 WHERE ws = ? AND user_id = ?').bind(s.ws, s.user_id).run();
    if (quiet) continue;
    await tg('sendMessage', { chat_id: s.user_id, text: T.remind(fmtWhen(s.expires_at, 0, s.lang) + ' UTC'), reply_markup: { inline_keyboard: [[{ text: T.renewBtn, callback_data: 'plans' }]] } });
    out.reminded++;
  }
  const { results: ended } = await env.DB.prepare(
    `SELECT s.*, u.lang, st.title FROM subscriptions s LEFT JOIN users u ON u.id = s.user_id LEFT JOIN settings st ON st.ws = s.ws WHERE s.status = 'active' AND s.expires_at <= ?${where} LIMIT 50`,
  ).bind(now, ...args).all();
  for (const s of ended) {
    const r = await env.DB.prepare("UPDATE subscriptions SET status = 'expired' WHERE ws = ? AND user_id = ? AND status = 'active'").bind(s.ws, s.user_id).run();
    if (r.meta.changes !== 1) continue;
    out.expired++;
    if (quiet) continue;
    const T = t(s.lang);
    if (!isDemo(env) && paidChannel(env)) {
      // "Kick": ban for a moment, then unban, so the person can come back after paying again.
      await tg('banChatMember', { chat_id: paidChannel(env), user_id: s.user_id, until_date: Math.floor(now / 1000) + 60 });
      await tg('unbanChatMember', { chat_id: paidChannel(env), user_id: s.user_id, only_if_banned: true });
    }
    await tg('sendMessage', {
      chat_id: s.user_id,
      text: T.expired(s.title || '') + (isDemo(env) ? T.expiredDemo : ''),
      reply_markup: { inline_keyboard: [[{ text: T.renewBtn, callback_data: 'plans' }]] },
    });
  }
  return out;
}
