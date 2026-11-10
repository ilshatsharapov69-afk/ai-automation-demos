-- Failed leads-table logins per IP hash: after 10 wrong passwords in 15 minutes the IP gets 429 for a while.
CREATE TABLE IF NOT EXISTS auth_fails (
  ip_hash TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_fails_ip ON auth_fails(ip_hash, at);
