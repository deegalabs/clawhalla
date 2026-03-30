-- Content Media table for images, videos, carousels
CREATE TABLE IF NOT EXISTS content_media (
  id TEXT PRIMARY KEY,
  draft_id TEXT,
  pipeline_id TEXT,
  type TEXT NOT NULL,           -- image | video | carousel_slide | thumbnail
  source TEXT NOT NULL,         -- upload | search | ai_generated | url
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  alt TEXT,
  caption TEXT,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER,
  sort_order INTEGER DEFAULT 0,
  source_query TEXT,
  source_credit TEXT,
  approved INTEGER DEFAULT 0,  -- 0=pending, 1=approved, -1=rejected
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_media_draft ON content_media(draft_id);
CREATE INDEX IF NOT EXISTS idx_content_media_pipeline ON content_media(pipeline_id);

-- Extend content_drafts with new columns
ALTER TABLE content_drafts ADD COLUMN media_items TEXT;
ALTER TABLE content_drafts ADD COLUMN format TEXT DEFAULT 'post';
ALTER TABLE content_drafts ADD COLUMN publish_result TEXT;
ALTER TABLE content_drafts ADD COLUMN review_note TEXT;
ALTER TABLE content_drafts ADD COLUMN approved_at INTEGER;
