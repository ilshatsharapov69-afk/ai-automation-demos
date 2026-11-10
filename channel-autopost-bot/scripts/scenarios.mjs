// Three scripted conversations run through the real Worker (src/worker.js) on the in-memory D1.
// Every bot message here is what the bot actually sent: the Telegram calls captured in env.TG_OUTBOX are folded
// into a chat (edits applied to the message they edit). Used by scripts/shots.mjs and scripts/transcript.mjs.
import { makeEnv, say, press, cron, NOW, ANNA, BORIS } from '../test/helpers.mjs';

const MIN = 60_000;
const SEP = '\n\n— — —\n';

/** Folds Telegram calls into chat bubbles. Fake message ids are 1000 + outbox position (see makeTg). */
class Chat {
  constructor(env, user) {
    this.env = env;
    this.user = user;
    this.items = [];
    this.byId = new Map();
    this.seen = 0;
    this.keyboard = null;
  }
  absorb(at, { afterPress = false } = {}) {
    const box = this.env.TG_OUTBOX;
    for (; this.seen < box.length; this.seen++) {
      const c = box[this.seen];
      const id = 1000 + this.seen + 1;
      if (c.method === 'sendMessage' || c.method === 'sendPhoto') {
        if (c.reply_markup?.keyboard) this.keyboard = c.reply_markup.keyboard;
        const b = { kind: 'bot', id, at, text: c.text ?? c.caption ?? '', entities: c.entities || c.caption_entities || [], photo: c.photo || null, buttons: c.reply_markup?.inline_keyboard || [], replyTo: c.reply_parameters?.message_id };
        this.items.push(b);
        this.byId.set(id, { text: b.text, photo: b.photo, shown: b });
      } else if (c.method.startsWith('editMessage')) {
        // In Telegram the message changes in place. Edits caused by a button press are drawn as a new version below
        // the press (in full when the content changed, as a short "updated" line when only the status line changed),
        // so the picture shows the step. Other edits, and buttons-only edits, change the bubble in place.
        const m = this.byId.get(c.message_id);
        if (!m) continue;
        const buttons = c.reply_markup?.inline_keyboard || [];
        if (c.method === 'editMessageReplyMarkup') { m.shown.buttons = buttons; continue; }
        const text = c.method === 'editMessageText' ? c.text : c.caption;
        const entities = (c.method === 'editMessageText' ? c.entities : c.caption_entities) || [];
        if (!afterPress) {
          Object.assign(m.shown, m.shown.compact ? { text: text.split(SEP)[1] ?? text, buttons, edited: true } : { text, entities, buttons, edited: true });
          m.text = text;
          continue;
        }
        const [oldBody] = m.text.split(SEP);
        const [newBody, status] = text.split(SEP);
        const b = status !== undefined && oldBody === newBody
          ? { kind: 'bot', id: c.message_id, at, edited: true, compact: true, text: status, entities: [], photo: null, buttons }
          : { kind: 'bot', id: c.message_id, at, edited: true, text, entities, photo: m.photo, buttons };
        this.items.push(b);
        m.text = text;
        m.shown = b;
      } else if (c.method === 'answerCallbackQuery' && c.text) {
        this.items.push({ kind: 'toast', at, text: c.text });
      }
    }
  }
  async say(content, at) {
    const m = typeof content === 'string' ? { text: content } : content;
    this.items.push({ kind: 'user', at, text: m.text ?? m.caption ?? '', photo: m.photo || null });
    await say(this.env, this.user, content, { now: at });
    this.absorb(at);
  }
  /** Press the button labelled `label` on the latest bot message that has it. */
  async press(label, at) {
    const b = [...this.items].reverse().find((i) => i.kind === 'bot' && i.buttons.flat().some((x) => x.text.includes(label)));
    if (!b) throw new Error(`no button «${label}»`);
    const btn = b.buttons.flat().find((x) => x.text.includes(label));
    this.items.push({ kind: 'press', at, text: btn.text });
    const m = this.byId.get(b.id);
    await press(this.env, this.user, btn.callback_data, { message_id: b.id, photo: m.photo, text: m.text }, { now: at });
    this.absorb(at, { afterPress: true });
  }
  async cron(at, note) {
    this.items.push({ kind: 'service', at, text: note });
    await cron(this.env, at);
    this.absorb(at);
  }
  /** Drop everything before this point from the picture (keeps the state). */
  cut() { this.items = []; }
}

export async function runScenarios() {
  const out = [];

  // 1. EN: AI draft from a topic -> preview -> Approve -> it is in the queue.
  {
    const env = makeEnv();
    const c = new Chat(env, ANNA);
    await c.say('/start', NOW - 2 * MIN);
    c.cut();
    await c.say('✨ AI draft', NOW);
    await c.say('brewing great coffee at home', NOW + MIN);
    await c.press('Approve', NOW + 2 * MIN);
    await c.say('🗓 Queue', NOW + 3 * MIN);
    out.push({ file: 'shots/1-ai-draft-approve.png', title: '1. AI draft from a topic, preview, Approve, queue (EN)', lang: 'en', theme: 'light', chat: c });
  }

  // 2. RU: a photo post -> preview -> set a time -> the cron Worker publishes it at that time.
  {
    const env = makeEnv();
    const c = new Chat(env, BORIS);
    await c.say('/start', NOW - 2 * MIN);
    c.cut();
    await c.say({ photo: 'latte', caption: 'Латте-арт недели ☕ Оцените от 1 до 10 в комментариях!' }, NOW);
    await c.press('Время', NOW + MIN);
    await c.say('12:45', NOW + 2 * MIN);
    await c.cron(Date.UTC(2026, 10, 5, 12, 45), '12:45 · cron Worker публикует пост по расписанию');
    out.push({ file: 'shots/2-photo-schedule-ru.png', title: '2. Пост с фото, время публикации, автопубликация (RU)', lang: 'ru', theme: 'light', chat: c });
  }

  // 3. EN dark: stats, then the paid-access flow with the mock payment.
  {
    const env = makeEnv();
    const c = new Chat(env, ANNA);
    await c.say('/start', NOW - 2 * MIN);
    c.cut();
    await c.say('📊 Stats', NOW);
    await c.say('💳 Paid access', NOW + MIN);
    await c.press('1 month', NOW + 2 * MIN);
    await c.press('Pay', NOW + 3 * MIN);
    out.push({ file: 'shots/3-stats-paid-dark.png', title: '3. Stats and paid access with a mock payment (EN, dark)', lang: 'en', theme: 'dark', chat: c });
  }
  return out;
}
