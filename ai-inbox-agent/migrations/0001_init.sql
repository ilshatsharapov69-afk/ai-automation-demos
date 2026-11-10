-- AI inbox agent: one row per incoming request (any channel), the owner's pending edit in Telegram, AI usage per day.
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,              -- 'form' | 'email' | 'telegram'
  external_id TEXT,                   -- email Message-ID or "<chat>:<message_id>", used to drop duplicates
  sender TEXT,                        -- email address, @username or contact from the form
  tg_chat_id INTEGER,                 -- Telegram chat to answer, when channel = 'telegram'
  subject TEXT,
  body TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en',
  category TEXT NOT NULL,             -- 'lead' | 'support' | 'spam' | 'partnership'
  confidence REAL,
  classified_by TEXT NOT NULL,        -- 'ai' | 'rules'
  name TEXT,
  email TEXT,
  phone TEXT,
  telegram TEXT,
  product TEXT,
  order_no TEXT,
  budget_amount REAL,
  budget_currency TEXT,
  budget_text TEXT,
  deadline_date TEXT,                 -- YYYY-MM-DD
  deadline_text TEXT,
  summary TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  hot INTEGER NOT NULL DEFAULT 0,
  score_reasons TEXT,                 -- JSON [{k, pts, v?}]
  draft TEXT,
  draft_source TEXT,                  -- 'ai' | 'template' | 'owner' | 'none'
  status TEXT NOT NULL DEFAULT 'new', -- 'new' | 'approved' | 'sent' | 'rejected' | 'spam'
  owner_chat_id INTEGER,
  owner_msg_id INTEGER,               -- the card in the owner's Telegram, edited when a decision is made
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT                     -- 'telegram' | 'web'
);
CREATE UNIQUE INDEX IF NOT EXISTS requests_ext ON requests(channel, external_id);
CREATE INDEX IF NOT EXISTS requests_created ON requests(created_at);

CREATE TABLE IF NOT EXISTS owner_state (
  chat_id INTEGER PRIMARY KEY,
  editing_id INTEGER,                 -- request whose draft the owner is rewriting
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage (
  day TEXT PRIMARY KEY,
  n INTEGER NOT NULL
);
