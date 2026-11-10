// Turns each intake channel into one message shape:
// {channel, externalId, sender, subject, body, name, nameHint, email, phone, telegram, tgChatId, langHint}
import { extractContacts } from './extract.js';

const MAX = 4000;
const clip = (s, n = MAX) => String(s ?? '').replace(/\r\n/g, '\n').trim().slice(0, n);

/** "Laura Kim <laura@x.example>" -> {name, email} */
export function parseFrom(from) {
  if (!from) return { name: null, email: null };
  if (typeof from === 'object') return { name: from.name || null, email: (from.email || from.address || '').toLowerCase() || null };
  const s = String(from).trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: /@/.test(s) ? s.toLowerCase() : null };
}

/** Web form: {name, contact, message, website(honeypot)} */
export function fromForm(f) {
  const contact = clip(f.contact, 200);
  const c = extractContacts(contact);
  if (!c.email && !c.phone && !c.telegram && /^[a-z][a-z0-9_]{4,31}$/i.test(contact)) c.telegram = '@' + contact;
  return {
    channel: 'form',
    externalId: f.id ? String(f.id).slice(0, 100) : null,
    sender: contact || null,
    subject: null,
    body: clip(f.message),
    name: clip(f.name, 80) || null,
    email: c.email, phone: c.phone, telegram: c.telegram,
    langHint: f.lang || null,
    honeypot: Boolean(f.website),
  };
}

/** Email-style JSON webhook (what an inbound-mail service or an Email Worker posts):
 *  {from: "Name <addr>" | {name, email}, subject, text, message_id?} */
export function fromEmail(e) {
  const { name, email } = parseFrom(e.from);
  return {
    channel: 'email',
    externalId: e.message_id || e.messageId ? String(e.message_id || e.messageId).slice(0, 200) : null,
    sender: email,
    subject: clip(e.subject, 200) || null,
    body: clip(stripQuoted(e.text || e.body || htmlToText(e.html || ''))),
    name: personName(name),
    nameHint: name,
    email,
    langHint: null,
  };
}

/** Telegram message from a customer. */
export function fromTelegram(m) {
  const f = m.from || {};
  return {
    channel: 'telegram',
    externalId: `${m.chat?.id ?? f.id}:${m.message_id ?? ''}`,
    sender: f.username ? '@' + f.username : String(f.id),
    subject: null,
    body: clip(m.text || m.caption || ''),
    name: null,
    nameHint: [f.first_name, f.last_name].filter(Boolean).join(' ') || null,
    telegram: f.username ? '@' + f.username : null,
    tgChatId: m.chat?.id ?? f.id,
    langHint: f.language_code || null,
  };
}

// A From display name is used as the person's name only if it looks like one ("Laura Kim", "Павел"),
// not a company or a role ("Growth Team", "ЛесПром Снаб", "ООО Ромашка").
export function personName(name) {
  const s = String(name || '').trim();
  if (!s || /@|\d/.test(s)) return null;
  if (/(team|promo|info|news|sales|support|noreply|no-reply|office|group|studio|shop|store|llc|ltd|inc|gmbh|ооо|оао|зао|ип\b|компания|магазин|отдел|команда|снаб|пром|торг|строй)/i.test(s)) return null;
  const words = s.split(/\s+/);
  if (words.length > 3) return null;
  if (!words.every((w) => /^[A-ZА-ЯЁ][a-zа-яё'-]+\.?$/.test(w))) return null; // CamelCase or ALLCAPS = brand
  return s;
}

function stripQuoted(t) {
  const s = String(t || '');
  // cut the quoted previous mail in replies
  const i = s.search(/\n(?:On .{5,80} wrote:|-{2,} ?Original Message|>.*\n>|\d{1,2}\.\d{1,2}\.\d{2,4}.{0,40}пишет:)/i);
  return i > 0 ? s.slice(0, i) : s;
}

export function htmlToText(h) {
  return String(h || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n');
}

// ---------- raw MIME (Cloudflare Email Routing -> Email Worker) ----------
function decodeWords(s) {
  // =?utf-8?B?...?= and =?utf-8?Q?...?= header words
  return String(s || '').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_, cs, enc, data) => {
    const bytes = enc.toUpperCase() === 'B' ? b64bytes(data) : qpBytes(data.replace(/_/g, ' '));
    return decodeBytes(bytes, cs);
  });
}
const b64bytes = (s) => Uint8Array.from(atob(s.replace(/\s+/g, '')), (c) => c.charCodeAt(0));
function qpBytes(s) {
  const out = [];
  const t = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9a-f]{2}$/i.test(t.slice(i + 1, i + 3))) { out.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; }
    else out.push(...new TextEncoder().encode(t[i]));
  }
  return Uint8Array.from(out);
}
function decodeBytes(bytes, charset = 'utf-8') {
  try { return new TextDecoder(charset.toLowerCase()).decode(bytes); } catch { return new TextDecoder().decode(bytes); }
}
function splitHead(part) {
  const i = part.search(/\r?\n\r?\n/);
  const head = i < 0 ? part : part.slice(0, i);
  const body = i < 0 ? '' : part.slice(i).replace(/^\r?\n\r?\n/, '');
  const headers = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const k = line.indexOf(':');
    if (k > 0) headers[line.slice(0, k).trim().toLowerCase()] = line.slice(k + 1).trim();
  }
  return { headers, body };
}
function decodePart(headers, body) {
  const enc = (headers['content-transfer-encoding'] || '').toLowerCase();
  const cs = ((headers['content-type'] || '').match(/charset="?([^";]+)/i) || [])[1] || 'utf-8';
  if (enc === 'base64') return decodeBytes(b64bytes(body), cs);
  if (enc === 'quoted-printable') return decodeBytes(qpBytes(body), cs);
  return body;
}
function findText(headers, body, depth = 0) {
  const ct = headers['content-type'] || 'text/plain';
  const bm = ct.match(/boundary="?([^";]+)"?/i);
  if (/^multipart\//i.test(ct) && bm && depth < 4) {
    const parts = body.split('--' + bm[1]).slice(1).filter((p) => !p.startsWith('--'));
    let html = null;
    for (const p of parts) {
      const { headers: h, body: b } = splitHead(p.replace(/^\r?\n/, ''));
      const r = findText(h, b, depth + 1);
      if (r.type === 'text') return r;
      if (r.type === 'html' && !html) html = r;
    }
    return html || { type: 'none', text: '' };
  }
  if (/^text\/html/i.test(ct)) return { type: 'html', text: htmlToText(decodePart(headers, body)) };
  if (/^text\//i.test(ct)) return { type: 'text', text: decodePart(headers, body) };
  return { type: 'none', text: '' };
}

/** Raw RFC 822 message -> the email-webhook shape. */
export function parseRawEmail(raw) {
  const { headers, body } = splitHead(String(raw));
  return {
    from: decodeWords(headers.from || ''),
    subject: decodeWords(headers.subject || ''),
    message_id: headers['message-id'] || null,
    text: findText(headers, body).text,
  };
}
