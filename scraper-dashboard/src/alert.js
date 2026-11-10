// Telegram alert for a monitor run. Optional: sent only when BOT_TOKEN and TG_CHAT_ID secrets are set.
// Language: ALERT_LANG = "ru" | "en". Price moves smaller than MIN_CHANGE_PCT are stored but not alerted.

const T = {
  en: {
    head: (n, run) => `📊 <b>Price monitor</b>: ${n} ${n === 1 ? 'change' : 'changes'} (run #${run})`,
    baseline: (n, run) => `📊 <b>Price monitor</b> is on: tracking ${n} items (run #${run}). Next alerts list only what changed.`,
    failed: (run, err) => `⚠️ <b>Price monitor</b>: run #${run} failed, nothing was marked removed.\n<code>${err}</code>`,
    partial: (cats) => `⚠️ Not checked this time: ${cats}`,
    new: 'new',
    gone: 'removed from the site',
    back: 'is back',
    out: 'out of stock',
    in: 'back in stock',
    more: (n) => `…and ${n} more on the dashboard`,
    sim: '🧪 Demo mode: changes are simulated (the practice site never changes its prices).',
    open: 'Open the dashboard',
  },
  ru: {
    head: (n, run) => `📊 <b>Монитор цен</b>: ${n} ${plural(n, 'изменение', 'изменения', 'изменений')} (запуск №${run})`,
    baseline: (n, run) => `📊 <b>Монитор цен</b> включён: отслеживаю ${n} ${plural(n, 'товар', 'товара', 'товаров')} (запуск №${run}). Дальше пришлю только изменения.`,
    failed: (run, err) => `⚠️ <b>Монитор цен</b>: запуск №${run} не удался, ничего не помечено как удалённое.\n<code>${err}</code>`,
    partial: (cats) => `⚠️ В этот раз не проверены: ${cats}`,
    new: 'новый',
    gone: 'исчез с сайта',
    back: 'снова на сайте',
    out: 'нет в наличии',
    in: 'снова в наличии',
    more: (n) => `…и ещё ${n} на дашборде`,
    sim: '🧪 Демо-режим: изменения смоделированы (на учебном сайте цены не меняются).',
    open: 'Открыть дашборд',
  },
};

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const SYMBOL = { GBP: '£', EUR: '€', USD: '$', RUB: '₽' };
export function money(cents, currency = 'GBP') {
  const v = (cents / 100).toFixed(2);
  return currency === 'RUB' ? `${v} ₽` : `${SYMBOL[currency] || ''}${v}`;
}

export function pctChange(oldC, newC) {
  return oldC ? ((newC - oldC) / oldC) * 100 : 0;
}

function fmtPct(p, lang) {
  const s = `${p > 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%`;
  return lang === 'ru' ? s.replace('.', ',') : s;
}

// changes: [{ item_id, kind, old_value, new_value }], items: Map id -> { title, currency }
export function formatAlert({ changes, items, runId, lang = 'en', simulated = false, publicUrl = '', minPct = 0, maxLines = 12 }) {
  const t = T[lang] || T.en;
  const title = (id) => escapeHtml(items.get(id)?.title || id);
  const cur = (id) => items.get(id)?.currency || 'GBP';
  const relevant = changes.filter((c) => c.kind !== 'price' || Math.abs(pctChange(c.old_value, c.new_value)) >= minPct);
  if (!relevant.length) return null;
  const rank = { price: 0, stock: 1, new: 2, back: 3, gone: 4 };
  const sorted = [...relevant].sort((a, b) => rank[a.kind] - rank[b.kind]
    || (a.kind === 'price' ? Math.abs(pctChange(b.old_value, b.new_value)) - Math.abs(pctChange(a.old_value, a.new_value)) : 0));
  const lines = sorted.slice(0, maxLines).map((c) => {
    const n = title(c.item_id);
    switch (c.kind) {
      case 'price': {
        const p = pctChange(c.old_value, c.new_value);
        return `${p < 0 ? '🔻' : '🔺'} ${n}: ${money(c.old_value, cur(c.item_id))} → <b>${money(c.new_value, cur(c.item_id))}</b> (${fmtPct(p, lang)})`;
      }
      case 'stock': return c.new_value ? `✅ ${n}: ${t.in}` : `⛔ ${n}: ${t.out}`;
      case 'new': return `🆕 ${n} — ${money(c.new_value, cur(c.item_id))} (${t.new})`;
      case 'back': return `↩️ ${n} ${t.back} — ${money(c.new_value, cur(c.item_id))}`;
      case 'gone': return `🗑 ${n}: ${t.gone}`;
      default: return `• ${n}`;
    }
  });
  if (sorted.length > maxLines) lines.push(t.more(sorted.length - maxLines));
  const parts = [t.head(relevant.length, runId), '', ...lines];
  if (simulated) parts.push('', t.sim);
  if (publicUrl) parts.push('', `<a href="${escapeHtml(publicUrl)}">${t.open}</a>`);
  return clip(parts.join('\n'));
}

export function formatBaseline({ count, runId, lang = 'en', publicUrl = '' }) {
  const t = T[lang] || T.en;
  return [t.baseline(count, runId), publicUrl ? `\n<a href="${escapeHtml(publicUrl)}">${t.open}</a>` : ''].join('');
}

export function formatFailure({ runId, error, lang = 'en' }) {
  return (T[lang] || T.en).failed(runId, escapeHtml(String(error).slice(0, 300)));
}

export function formatPartial({ categories, lang = 'en' }) {
  return (T[lang] || T.en).partial(escapeHtml(categories.join(', ')));
}

function clip(text) {
  return text.length <= 4000 ? text : text.slice(0, 3990) + '\n…';
}

export async function sendTelegram(env, text, fetchFn = fetch) {
  if (!text) return { sent: false, reason: 'nothing to send' };
  if (!env.BOT_TOKEN || !env.TG_CHAT_ID) return { sent: false, reason: 'BOT_TOKEN / TG_CHAT_ID not set' };
  const res = await fetchFn(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  return body?.ok ? { sent: true } : { sent: false, reason: body?.description || `HTTP ${res.status}` };
}
