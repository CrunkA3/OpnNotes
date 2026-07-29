CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE pages (
  id           text PRIMARY KEY,
  path         text NOT NULL UNIQUE,
  title        text NOT NULL,
  tags         text[] NOT NULL DEFAULT '{}',
  aliases      text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL,
  content_hash text NOT NULL,
  indexed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE page_fts (
  page_id text PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
  tsv     tsvector NOT NULL
);
CREATE INDEX page_fts_tsv_idx ON page_fts USING GIN (tsv);

CREATE TABLE links (
  id          bigserial PRIMARY KEY,
  src_page_id text NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  dst_page_id text REFERENCES pages(id) ON DELETE SET NULL,
  raw_target  text NOT NULL,
  display     text,
  anchor      text
);
CREATE INDEX links_src_idx ON links(src_page_id);
CREATE INDEX links_dst_idx ON links(dst_page_id);
