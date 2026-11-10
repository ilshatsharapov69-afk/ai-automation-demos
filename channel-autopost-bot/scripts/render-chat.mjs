// Renders a folded conversation (scripts/scenarios.mjs) as a Telegram-like chat page: bubbles, inline buttons,
// formatting entities, reply quotes, the reply keyboard. Only the look is a mock; every text comes from the bot.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);

/** Telegram entities (UTF-16 offsets, same as JS strings) -> HTML. */
export function entitiesToHtml(text, entities = []) {
  const opens = new Map(), closes = new Map();
  const tag = (e) => ({ bold: ['<b>', '</b>'], italic: ['<i>', '</i>'], underline: ['<u>', '</u>'], strikethrough: ['<s>', '</s>'], code: ['<code>', '</code>'], pre: ['<pre>', '</pre>'], text_link: [`<a href="${esc(e.url)}">`, '</a>'] }[e.type]);
  for (const e of [...entities].sort((a, b) => a.offset - b.offset || b.length - a.length)) {
    const t = tag(e);
    if (!t) continue;
    (opens.get(e.offset) || opens.set(e.offset, []).get(e.offset)).push(t[0]);
    (closes.get(e.offset + e.length) || closes.set(e.offset + e.length, []).get(e.offset + e.length)).unshift(t[1]);
  }
  let out = '';
  for (let i = 0; i <= text.length; i++) {
    if (closes.has(i)) out += closes.get(i).join('');
    if (opens.has(i)) out += opens.get(i).join('');
    if (i < text.length) out += esc(text[i]);
  }
  // Hashtags (not "#15", which is a post number) get the link colour; only text between tags is touched.
  out = out.split(/(<[^>]+>)/).map((seg, i) => (i % 2 ? seg : seg.replace(/#(?=[\p{N}_]*\p{L})[\p{L}\p{N}_]+/gu, (m) => `<span class="tag">${m}</span>`))).join('');
  return out.replace(/<pre>\n?/g, '<pre>').replace(/\n?<\/pre>\n?/g, '</pre>');
}

const PHOTOS = {
  latte: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><defs><radialGradient id="t" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#8a5a3c"/><stop offset="1" stop-color="#3b2416"/></radialGradient><radialGradient id="c" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#d9a877"/><stop offset=".8" stop-color="#9c6339"/><stop offset="1" stop-color="#6e3f22"/></radialGradient></defs><rect width="320" height="220" fill="url(#t)"/><ellipse cx="248" cy="120" rx="40" ry="13" fill="#f3ece4" opacity=".9" transform="rotate(-20 248 120)"/><circle cx="160" cy="110" r="84" fill="#f6f1ea"/><circle cx="160" cy="110" r="70" fill="url(#c)"/><path d="M160 150 C120 118 118 86 140 80 C152 77 158 86 160 94 C162 86 168 77 180 80 C202 86 200 118 160 150Z" fill="#fbf4ea"/><path d="M160 150 C140 132 134 112 146 104 C154 100 158 108 160 114 C162 108 166 100 174 104 C186 112 180 132 160 150Z" fill="#c78b5c" opacity=".55"/></svg>`,
};
const photoSrc = (id) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PHOTOS[id] || PHOTOS.latte)}`;

function bubble(i, chat) {
  if (i.kind === 'press') return `<div class="pill press">👆 ${esc(i.text)}</div>`;
  if (i.kind === 'toast') return `<div class="pill toast">${esc(i.text)}</div>`;
  if (i.kind === 'service') return `<div class="pill service">⏰ ${esc(i.text)}</div>`;
  const mine = i.kind === 'user';
  const photo = i.photo ? `<img class="photo" src="${photoSrc(i.photo)}" alt="">` : '';
  let quote = '';
  if (i.replyTo) {
    const q = chat.items.find((x) => x.kind === 'bot' && x.id === i.replyTo);
    if (q) quote = `<div class="quote"><b>Pinecone Autopost</b><span>${esc(q.text.split('\n')[0])}</span></div>`;
  }
  const body = i.compact
    ? `<div class="editnote">✏️ ${chat.lang === 'ru' ? 'сообщение изменено' : 'message updated'}</div><div class="text">${esc(i.text)}</div>`
    : i.text ? `<div class="text">${mine ? esc(i.text) : entitiesToHtml(i.text, i.entities)}</div>` : '';
  const meta = `<span class="meta">${i.edited ? (chat.lang === 'ru' ? 'изм. ' : 'edited ') : ''}${hhmm(i.at)}${mine ? ' ✓✓' : ''}</span>`;
  const kb = (i.buttons || []).filter((r) => r.length).map((r) => `<div class="kbrow">${r.map((b) => `<div class="kb">${esc(b.text)}${b.url ? ' ↗' : ''}</div>`).join('')}</div>`).join('');
  return `<div class="msg ${mine ? 'out' : 'in'}"><div class="bubble${photo ? ' hasphoto' : ''}">${photo}${quote}${body}${meta}</div>${kb ? `<div class="kbs">${kb}</div>` : ''}</div>`;
}

export function chatHtml(s) {
  const { chat, theme } = s;
  const keyboard = chat.keyboard ? `<div class="replykb">${chat.keyboard.map((r) => `<div class="rrow">${r.map((b) => `<div class="rk">${esc(b.text)}</div>`).join('')}</div>`).join('')}</div>` : '';
  return `<!doctype html><html lang="${s.lang}" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.title)}</title>
<style>
:root{--bg:linear-gradient(160deg,#c9dcb5 0%,#a9c79c 45%,#8fb592 100%);--in:#fff;--out:#e1fec6;--text:#000;--meta:#7d8e83;--outmeta:#5fa65a;--kb:rgba(36,63,46,.32);--kbtext:#fff;--head:#fff;--headtext:#000;--sub:#8b9096;--link:#2a76c6;--pill:rgba(36,63,46,.38);--pre:rgba(0,0,0,.05);--tag:#2a76c6;--quote:#2a76c6;--panel:#f1f1f4;--rk:#fff;--rkshadow:0 1px 0 rgba(0,0,0,.18);--toast:rgba(20,20,20,.78)}
[data-theme=dark]{--bg:linear-gradient(160deg,#0e1621 0%,#17212b 100%);--in:#182533;--out:#2b5278;--text:#f5f5f5;--meta:#6d7f8f;--outmeta:#7da8d3;--kb:rgba(255,255,255,.09);--kbtext:#e9eef3;--head:#17212b;--headtext:#f5f5f5;--sub:#6d7f8f;--link:#6ab3f3;--pill:rgba(255,255,255,.09);--pre:rgba(255,255,255,.06);--tag:#6ab3f3;--quote:#6ab3f3;--panel:#17212b;--rk:#2b3a49;--rkshadow:none;--toast:rgba(0,0,0,.72)}
*{box-sizing:border-box;margin:0}
body{width:400px;font:15px/1.38 -apple-system,"SF Pro Text","Segoe UI",Roboto,"Noto Sans","Helvetica Neue",Arial,"Noto Color Emoji","Apple Color Emoji",sans-serif;color:var(--text);background:#000;-webkit-font-smoothing:antialiased}
.phone{background:var(--bg);min-height:100vh;display:flex;flex-direction:column}
.head{background:var(--head);color:var(--headtext);display:flex;align-items:center;gap:10px;padding:10px 14px;box-shadow:0 1px 0 rgba(0,0,0,.12);position:relative;z-index:1}
.back{color:var(--link);font-size:22px;margin-right:2px}
.ava{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#f3a35c,#b3562a);color:#fff;display:grid;place-items:center;font-weight:700;font-size:17px}
.who b{display:block;font-size:16px}.who span{font-size:13px;color:var(--sub)}
.feed{flex:1;padding:10px 8px 12px;display:flex;flex-direction:column;gap:6px}
.msg{display:flex;flex-direction:column;max-width:86%}
.msg.in{align-self:flex-start}.msg.out{align-self:flex-end;align-items:flex-end}
.bubble{background:var(--in);border-radius:16px 16px 16px 5px;padding:6px 10px 6px;box-shadow:0 1px 1px rgba(0,0,0,.13);position:relative;overflow:hidden;min-width:80px}
.out .bubble{background:var(--out);border-radius:16px 16px 5px 16px}
.bubble.hasphoto{padding:0 0 6px;width:300px}.bubble.hasphoto .text,.bubble.hasphoto .meta{margin:0 10px}
.photo{display:block;width:100%;height:200px;object-fit:cover;margin-bottom:6px}
.text{white-space:pre-wrap;word-wrap:break-word}
.text a{color:var(--link);text-decoration:none}.tag{color:var(--tag)}
pre{font:12.5px/1.45 "SF Mono",Menlo,Consolas,"DejaVu Sans Mono",monospace;background:var(--pre);border-radius:6px;padding:6px 8px;margin:4px 0;white-space:pre}
.meta{float:right;font-size:11.5px;color:var(--meta);margin:6px 0 -2px 10px;line-height:1}
.out .meta{color:var(--outmeta)}
.editnote{font-size:12px;color:var(--meta);margin-bottom:1px}
.quote{border-left:3px solid var(--quote);background:color-mix(in srgb,var(--quote) 10%,transparent);border-radius:4px;padding:2px 8px;margin:2px 0 5px;font-size:13.5px;display:flex;flex-direction:column}
.quote b{color:var(--quote);font-size:13px}.quote span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
.kbs{display:flex;flex-direction:column;gap:3px;margin-top:3px;width:100%}
.kbrow{display:flex;gap:3px}
.kb{flex:1;background:var(--kb);color:var(--kbtext);border-radius:10px;text-align:center;padding:8px 6px;font-size:14px;font-weight:500;backdrop-filter:blur(6px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.msg.in .kbs{min-width:300px}
.pill{align-self:center;background:var(--pill);color:#fff;border-radius:14px;padding:4px 12px;font-size:13px;font-weight:500;max-width:92%;text-align:center;margin:3px 0}
.pill.toast{background:var(--toast);border-radius:10px;font-weight:400;padding:7px 14px}
.replykb{background:var(--panel);padding:6px 6px 10px;display:flex;flex-direction:column;gap:6px;border-top:1px solid rgba(0,0,0,.08)}
.rrow{display:flex;gap:6px}.rk{flex:1;background:var(--rk);box-shadow:var(--rkshadow);border-radius:8px;text-align:center;padding:10px 4px;font-size:14.5px;color:var(--text)}
</style></head><body><div class="phone">
<div class="head"><span class="back">‹</span><div class="ava">P</div><div class="who"><b>Pinecone Autopost · demo</b><span>bot</span></div></div>
<div class="feed">${chat.items.map((i) => bubble(i, { ...chat, lang: s.lang })).join('\n')}</div>
${keyboard}
</div></body></html>`;
}
