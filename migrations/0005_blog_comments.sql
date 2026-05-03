CREATE TABLE IF NOT EXISTS blog_comments (
  id TEXT PRIMARY KEY,
  post_slug TEXT NOT NULL,
  post_href TEXT,
  author_name TEXT NOT NULL,
  author_url TEXT,
  body TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 1,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blog_comments_post_approved_created
  ON blog_comments (post_slug, approved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blog_comments_created
  ON blog_comments (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blog_comments_ip_hash
  ON blog_comments (ip_hash);
