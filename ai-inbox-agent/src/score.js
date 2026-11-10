// Lead score 0-100, fully rule-based so the owner can see why a lead is "hot".
import biz from '../data/business.js';
import { daysUntil, fmtMoney, norm } from './extract.js';

const URGENT = /(urgent|asap|as soon as possible|rush|срочно|как можно скорее|побыстрее|горит)/;

/** @returns {{score:number, hot:boolean, reasons:{k:string, v?:string, pts:number}[]}} */
export function scoreLead(r, text, now = new Date()) {
  if (r.category !== 'lead') return { score: 0, hot: false, reasons: [] };
  const reasons = [];
  const add = (k, pts, v) => reasons.push({ k, pts, ...(v != null ? { v: String(v) } : {}) });
  add('base', 25);
  if (r.budget) {
    add('budget', 15, fmtMoney(r.budget.amount, r.budget.currency, r.lang));
    const min = biz.hot.bigBudget[r.budget.currency];
    if (min && r.budget.amount >= min) add('bigBudget', 20, fmtMoney(min, r.budget.currency, r.lang));
  }
  if (r.deadline) {
    const d = daysUntil(r.deadline.date, now);
    if (d != null && d >= 0 && d <= biz.hot.soonDays) add('soon', 20, d);
    else add('deadline', 5);
  }
  if (URGENT.test(norm(text))) add('urgent', 5);
  if (r.phone) add('phone', 10);
  else if (r.email || r.telegram) add('contact', 5);
  if (r.product) add('product', 5);
  if (r.name) add('name', 5);
  const score = Math.min(100, reasons.reduce((a, b) => a + b.pts, 0));
  return { score, hot: score >= biz.hot.minScore, reasons };
}
