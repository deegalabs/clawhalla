CREATE TABLE IF NOT EXISTS `chat_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `agent_id` text NOT NULL,
  `mode` text NOT NULL DEFAULT 'single',
  `participants` text,
  `model` text,
  `message_count` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `archived_at` integer
);
-->statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `role` text NOT NULL,
  `agent_id` text,
  `content` text NOT NULL,
  `tool_calls` text,
  `thinking_content` text,
  `artifacts` text,
  `attachments` text,
  `model` text,
  `input_tokens` integer,
  `output_tokens` integer,
  `duration_ms` integer,
  `created_at` integer NOT NULL
);
-->statement-breakpoint
CREATE TABLE IF NOT EXISTS `content_drafts` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `content` text NOT NULL,
  `platform` text NOT NULL,
  `status` text NOT NULL DEFAULT 'draft',
  `hashtags` text,
  `media_url` text,
  `scheduled_at` integer,
  `published_at` integer,
  `agent_id` text,
  `pipeline_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
-->statement-breakpoint
CREATE TABLE IF NOT EXISTS `content_pipelines` (
  `id` text PRIMARY KEY NOT NULL,
  `platform` text NOT NULL,
  `topic` text NOT NULL,
  `status` text NOT NULL DEFAULT 'active',
  `current_step` integer NOT NULL DEFAULT 0,
  `steps` text NOT NULL,
  `final_text` text,
  `final_hashtags` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
