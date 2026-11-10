-- Counters that keep the public browser demo inside the free D1 limits (new sandboxes per IP per hour, per day).
CREATE TABLE IF NOT EXISTS demo_limits (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS workspaces_created ON workspaces(created_at);
