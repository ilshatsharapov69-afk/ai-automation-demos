-- Price monitor schema. Times are Unix milliseconds, prices are integer pennies/cents.

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  trigger TEXT NOT NULL,             -- 'lazy' | 'manual' (old rows: 'cron')
  status TEXT NOT NULL,              -- 'running' | 'ok' | 'partial' | 'error'
  pages INTEGER DEFAULT 0,
  items INTEGER DEFAULT 0,
  changes INTEGER DEFAULT 0,
  error TEXT,
  simulated INTEGER DEFAULT 0        -- 1 when DEMO_DRIFT was on for this run
);
CREATE INDEX IF NOT EXISTS runs_started ON runs (started_at);

-- Latest known state of every listing ever seen.
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,               -- slug from the product URL, e.g. 'sharp-objects_997'
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  image TEXT,
  category TEXT,
  currency TEXT DEFAULT 'GBP',
  price_cents INTEGER,
  prev_price_cents INTEGER,          -- price before the last price change
  in_stock INTEGER,
  rating INTEGER,
  active INTEGER NOT NULL DEFAULT 1, -- 0 = no longer listed on the site
  first_seen INTEGER,
  last_seen INTEGER,
  last_change INTEGER
);
CREATE INDEX IF NOT EXISTS items_category ON items (category);

-- One row per item per run: the price history behind the charts.
CREATE TABLE IF NOT EXISTS snapshots (
  run_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  price_cents INTEGER,
  in_stock INTEGER,
  rating INTEGER,
  PRIMARY KEY (run_id, item_id)
);
CREATE INDEX IF NOT EXISTS snapshots_item ON snapshots (item_id, run_id);

-- What changed: 'price' | 'stock' | 'new' | 'gone' | 'back'.
CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  old_value INTEGER,
  new_value INTEGER
);
CREATE INDEX IF NOT EXISTS changes_at ON changes (at);
CREATE INDEX IF NOT EXISTS changes_item ON changes (item_id);
