-- Leads from the landing quiz. One row per submitted form; the estimate is recomputed by the Worker.
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,              -- ISO 8601 UTC
  lang TEXT NOT NULL,                    -- site language: 'en' | 'ru'
  name TEXT NOT NULL,
  phone TEXT NOT NULL,                   -- normalised, '+' and digits
  contact TEXT NOT NULL,                 -- 'call' | 'telegram' | 'whatsapp'
  comment TEXT,
  property TEXT NOT NULL,
  area INTEGER NOT NULL,
  scope TEXT NOT NULL,
  extras TEXT NOT NULL,                  -- JSON array of option ids
  start TEXT NOT NULL,
  est_min INTEGER NOT NULL,
  est_max INTEGER NOT NULL,
  currency TEXT NOT NULL,
  weeks_min INTEGER NOT NULL,
  weeks_max INTEGER NOT NULL,
  utm TEXT,                              -- JSON object of utm_* values
  page TEXT,
  ip_hash TEXT,                          -- salted SHA-256 of the IP, only for rate limiting
  duplicate_of INTEGER,                  -- earlier lead with the same phone (last 30 days)
  status TEXT NOT NULL DEFAULT 'new',    -- 'new' | 'contacted' | 'visit' | 'won' | 'lost'
  note TEXT,                             -- the owner's note from the leads table
  tg_status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'failed' | 'skipped'
  tg_error TEXT
);
CREATE INDEX IF NOT EXISTS leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS leads_ip ON leads(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS leads_phone ON leads(phone, created_at);
