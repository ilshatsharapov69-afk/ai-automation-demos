-- Counters for the AI caps: one row per (visitor, hour) and one per day. No IPs are stored, only a salted hash prefix.
CREATE TABLE IF NOT EXISTS ai_usage (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL
);
