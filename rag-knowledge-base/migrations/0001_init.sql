-- RAG knowledge base demo: documents, chunks, a full-text index over the chunks, rate limits, answer cache.
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  lang TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,               -- "<doc id>#<index>", the same id is used in the vector index
  doc_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  heading TEXT NOT NULL,
  start INTEGER NOT NULL,            -- offsets into docs.body, so a citation can highlight the exact passage
  "end" INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_doc ON chunks (doc_id, idx);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  chunk_id UNINDEXED, title, heading, text,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Visitor limit: one row per (hashed IP, hour).
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL
);

-- Global daily budget of generated answers.
CREATE TABLE IF NOT EXISTS usage (
  day TEXT PRIMARY KEY,
  n INTEGER NOT NULL
);

-- Cached answers for the example questions (free for visitors).
CREATE TABLE IF NOT EXISTS answer_cache (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
