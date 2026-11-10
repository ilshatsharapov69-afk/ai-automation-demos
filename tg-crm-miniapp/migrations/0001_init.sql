-- Telegram Mini App CRM schema.
-- A workspace is one sales team. In DEMO_MODE every visitor gets a private sandbox workspace ("demo-<telegram id>")
-- seeded with fictional data; in team mode there is one workspace ("team") and access is by membership.
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT,
  created_at TEXT NOT NULL
);

-- Sales people. tg_id is NULL for seeded fictional colleagues (they never get Telegram messages).
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  tg_id INTEGER,
  name TEXT NOT NULL,
  username TEXT,
  role TEXT NOT NULL DEFAULT 'sales',      -- 'admin' | 'sales'
  lang TEXT NOT NULL DEFAULT 'en',         -- 'en' | 'ru'
  tz_offset INTEGER NOT NULL DEFAULT 0,    -- minutes to add to UTC for the member's local time (sent by the Mini App)
  digest_on INTEGER NOT NULL DEFAULT 1,
  last_digest TEXT,                        -- local date (YYYY-MM-DD) of the last daily digest
  last_seen TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS members_ws_tg ON members(workspace_id, tg_id);
CREATE INDEX IF NOT EXISTS members_tg ON members(tg_id);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  source TEXT NOT NULL DEFAULT 'website',  -- telegram | website | referral | call | event
  status TEXT NOT NULL DEFAULT 'new',      -- new | contacted | qualified | proposal | won | lost
  value INTEGER NOT NULL DEFAULT 0,        -- expected deal size, whole currency units
  owner_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT                           -- set when status becomes won or lost
);
CREATE INDEX IF NOT EXISTS leads_ws ON leads(workspace_id, updated_at);

-- Lead timeline: notes written by people and events written by the system.
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  author_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'note',       -- note | status ("old>new") | owner (new owner name) | created
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_lead ON notes(lead_id, created_at);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  lead_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  due_at TEXT NOT NULL,                    -- ISO time, UTC
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,                            -- when the bot pinged the member
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reminders_ws ON reminders(workspace_id, done, due_at);
CREATE INDEX IF NOT EXISTS reminders_due ON reminders(done, sent_at, due_at);
