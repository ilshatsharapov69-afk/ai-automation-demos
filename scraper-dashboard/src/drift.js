// Demo mode (DEMO_DRIFT = "on"). The practice site never changes its prices, so a monitor pointed at it would
// show flat lines forever. In demo mode each run moves a few prices by 3-15 % and sells out / restocks a few items,
// starting from the last stored value (a random walk that stays within 60-140 % of the scraped price).
// It is deterministic (seeded by item id + run id), clearly flagged in the dashboard and in every alert,
// and off for a real client (DEMO_DRIFT = "off": the stored values are exactly what the site shows).

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rand(key) {
  // mulberry32 step over the hash, returns [0, 1)
  let t = (fnv1a(key) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const DRIFT = { priceChance: 0.08, sellOutChance: 0.03, restockChance: 0.25, minPct: 3, maxPct: 15, floor: 0.6, ceil: 1.4 };

export function applyDrift(item, prev, runId) {
  if (!prev || prev.price_cents == null) return item; // first sighting: keep the scraped value
  const scraped = item.price_cents;
  let price = prev.price_cents;
  if (rand(`${item.id}:p:${runId}`) < DRIFT.priceChance) {
    const pct = DRIFT.minPct + Math.floor(rand(`${item.id}:pct:${runId}`) * (DRIFT.maxPct - DRIFT.minPct + 1));
    let dir = rand(`${item.id}:dir:${runId}`) < 0.55 ? -1 : 1;
    if (price * (1 + dir * pct / 100) > scraped * DRIFT.ceil) dir = -1;
    if (price * (1 + dir * pct / 100) < scraped * DRIFT.floor) dir = 1;
    price = Math.max(99, Math.round(price * (1 + dir * pct / 100)));
  }
  let in_stock = prev.in_stock == null ? item.in_stock : prev.in_stock;
  // sells out rarely, restocks within a few runs
  if (rand(`${item.id}:s:${runId}`) < (in_stock ? DRIFT.sellOutChance : DRIFT.restockChance)) in_stock = in_stock ? 0 : 1;
  return { ...item, price_cents: price, in_stock };
}
