-- Demo bot schema: one row per chat (language + flow state), leads (bookings and requests),
-- questions the bot was asked (so the owner sees what it could not answer), AI usage per chat per day.
CREATE TABLE IF NOT EXISTS chats (
  chat_id INTEGER PRIMARY KEY,
  lang TEXT NOT NULL DEFAULT 'en',
  state TEXT,
  username TEXT,
  first_seen TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  username TEXT,
  kind TEXT NOT NULL,            -- 'booking' | 'request'
  service TEXT,
  day TEXT,
  slot TEXT,
  name TEXT,
  contact TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'new',  -- 'new' | 'confirmed' | 'declined'
  lang TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_chat ON leads(chat_id);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  answered INTEGER NOT NULL,     -- 1 answered from the FAQ, 0 handed to the owner
  source TEXT NOT NULL,          -- 'ai' | 'faq' | 'none'
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage (
  chat_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (chat_id, day)
);
