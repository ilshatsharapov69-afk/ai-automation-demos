-- Public demo: who a request belongs to, which path read it (AI or rules, and why), and rate counters.
ALTER TABLE requests ADD COLUMN origin TEXT NOT NULL DEFAULT 'live';   -- 'seed' (sample data) | 'visitor' (web form, public demo) | 'live' (email webhook, Telegram)
ALTER TABLE requests ADD COLUMN visitor TEXT;                          -- random id from the visitor's cookie, for 'visitor' rows
ALTER TABLE requests ADD COLUMN ai_note TEXT;                          -- 'ok' | 'ip_cap' | 'day_cap' | 'off' | 'no_ai' | 'error'
ALTER TABLE requests ADD COLUMN ai_model TEXT;                         -- model that classified it, when the AI did
ALTER TABLE requests ADD COLUMN ai_draft_model TEXT;                   -- model that wrote the reply, when the AI did
CREATE INDEX IF NOT EXISTS requests_origin ON requests(origin, visitor);

-- Counters per key and time bucket: AI calls per IP per hour, AI calls per day, form submissions per IP per hour.
CREATE TABLE IF NOT EXISTS demo_rate (
  k TEXT NOT NULL,
  b TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (k, b)
);
