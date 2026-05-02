CREATE TABLE IF NOT EXISTS blog_assets (
  key TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  body TEXT NOT NULL,
  byte_length INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blog_assets_slug
ON blog_assets (slug);
