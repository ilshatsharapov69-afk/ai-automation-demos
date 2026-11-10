// Small text helpers shared by the Worker and the browser (plain ES module, no dependencies).

const STOP_EN = new Set(('a an the and or but if so of to in on at by for with from into onto about over under up down out off ' +
  'is are was were be been being am do does did done have has had having will would can could should shall may might must ' +
  'i you he she it we they me him her us them my your his its our their this that these those there here what which who whom ' +
  'when where why how all any both each few more most other some such no nor not only own same than too very just also then ' +
  'now okay ok yeah yes well right really actually basically going gonna get got make made thing things one two lot lots ' +
  "let let's im i'm it's don't dont you're youre we're thats that's because like want need see look know think say said way " +
  'number part three four five six seven eight nine ten eleven twelve twenty thirty hundred first second third last next').split(/\s+/));

const STOP_RU = new Set(('и в во не что он на я с со как а то все всё она так его но да ты к у же вы за бы по только ее её мне было ' +
  'вот от меня еще ещё нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ' +
  'ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже ' +
  'себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда ' +
  'зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве ' +
  'три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это эта ' +
  'итак так вот окей просто очень который которые которая которое нужно сегодня давайте давай всем привет здравствуйте ' +
  'также ещё самое самый свой свои своих весь вся очень например значит смотрите кстати ' +
  'четыре пять шесть семь восемь девять десять двенадцать четырнадцать двадцать тридцать сорок сто первый второй третий ' +
  'одна одно трёх трех двух часов часа минут день дней раза').split(/\s+/));

export function stopwords(lang) { return lang === 'ru' ? STOP_RU : STOP_EN; }

/** 'ru' when Cyrillic letters dominate, else 'en'. */
export function detectLang(text) {
  const cyr = (String(text).match(/[а-яё]/gi) || []).length;
  const lat = (String(text).match(/[a-z]/gi) || []).length;
  return cyr > lat ? 'ru' : 'en';
}

export function words(text) {
  return String(text).toLowerCase().replace(/ё/g, 'е').match(/[a-zа-я0-9][a-zа-я0-9'’-]*/g) || [];
}

/** Ranked single keywords and two-word phrases (frequency, stopwords removed). Deterministic order. */
export function keywords(text, lang) {
  const stop = stopwords(lang);
  const ws = words(text).map((w) => w.replace(/[’']s$/, '').replace(/^-+|-+$/g, ''));
  const ok = (w) => w.length >= 3 && !stop.has(w) && !/^\d+$/.test(w);
  const uni = new Map();
  const bi = new Map();
  const add = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (let i = 0; i < ws.length; i++) {
    if (!ok(ws[i])) continue;
    add(uni, ws[i]);
    if (i + 1 < ws.length && ok(ws[i + 1])) add(bi, ws[i] + ' ' + ws[i + 1]);
    // "basil on windowsill", "базилик на подоконнике": two words joined by a short preposition
    else if (i + 2 < ws.length && ws[i + 1].length <= 3 && stop.has(ws[i + 1]) && ok(ws[i + 2])) add(bi, ws.slice(i, i + 3).join(' '));
  }
  const rank = (m, min) => [...m.entries()].filter(([, c]) => c >= min)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || (a[0] < b[0] ? -1 : 1))
    .map(([w]) => w);
  return { single: rank(uni, 1), pairs: rank(bi, 2), count: Object.fromEntries(uni) };
}

/** Sentences of a text (split on . ! ? …), trimmed, empty ones removed. */
export function sentences(text) {
  return String(text).replace(/\s+/g, ' ').split(/(?<=[.!?…])\s+(?=[A-ZА-ЯЁ0-9"«(])/).map((s) => s.trim()).filter(Boolean);
}

/** Russian plural: plural(5, 'вещь', 'вещи', 'вещей') -> 'вещей'. */
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Cut to max chars on a word boundary (no ellipsis). */
export function clip(s, max) {
  s = String(s).trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const i = cut.lastIndexOf(' ');
  return (i > max * 0.5 ? cut.slice(0, i) : s.slice(0, max)).replace(/[\s,;:–—-]+$/, '');
}
