-- Channel autopost bot: D1 schema. All times are Unix milliseconds (UTC).
-- A "workspace" (ws) is one channel: 'main' in live mode, 'u<telegram id>' for each visitor's sandbox in demo mode.

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,          -- Telegram user id
  lang       TEXT NOT NULL DEFAULT 'en',   -- 'en' | 'ru'
  name       TEXT,
  username   TEXT,
  state      TEXT,                         -- JSON: what the bot waits for next ({"await":"edit","post":12} ...)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  ws         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,                -- channel name, used in texts and in the AI prompt
  channel_id TEXT,                         -- '@name' or '-100...' (live mode; overrides CHANNEL_ID)
  slots      TEXT NOT NULL,                -- 'HH:MM,HH:MM' publishing times, local to tz
  tz         INTEGER NOT NULL DEFAULT 0,   -- UTC offset in minutes
  ai_day     TEXT,                         -- 'YYYY-MM-DD' of the AI counter
  ai_used    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ws             TEXT NOT NULL,
  author_id      INTEGER NOT NULL,
  text           TEXT NOT NULL DEFAULT '',
  entities       TEXT,                     -- JSON Telegram entities (bold, links...) kept from the owner's message
  photo          TEXT,                     -- Telegram file_id
  source         TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'ai' | 'stub' (offline template)
  topic          TEXT,
  variant        INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'draft',  -- draft | approved | publishing | published | failed
  scheduled_at   INTEGER,
  published_at   INTEGER,
  channel_msg_id INTEGER,
  error          TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_due ON posts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS posts_ws ON posts (ws, status);

-- Paid access skeleton. provider = 'mock' everywhere in this demo: no money moves.
CREATE TABLE IF NOT EXISTS payments (
  id         TEXT PRIMARY KEY,
  ws         TEXT NOT NULL,
  user_id    INTEGER NOT NULL,
  plan       TEXT NOT NULL,
  amount     REAL NOT NULL,
  currency   TEXT NOT NULL,
  provider   TEXT NOT NULL DEFAULT 'mock',
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | paid | cancelled
  created_at INTEGER NOT NULL,
  paid_at    INTEGER
);

CREATE TABLE IF NOT EXISTS subscriptions (
  ws          TEXT NOT NULL,
  user_id     INTEGER NOT NULL,
  plan        TEXT NOT NULL,
  status      TEXT NOT NULL,               -- active | expired
  started_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  invite_link TEXT,
  reminded    INTEGER NOT NULL DEFAULT 0,  -- "access ends soon" sent
  PRIMARY KEY (ws, user_id)
);
CREATE INDEX IF NOT EXISTS subs_due ON subscriptions (status, expires_at);
