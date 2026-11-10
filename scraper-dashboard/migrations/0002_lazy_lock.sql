-- Lazy refresh lock: one row, value = Unix ms until which a run is considered in progress (0 = free).
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
