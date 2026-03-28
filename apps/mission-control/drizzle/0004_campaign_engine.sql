CREATE TABLE IF NOT EXISTS `campaigns` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `subject` text NOT NULL,
  `from_name` text NOT NULL,
  `from_email` text NOT NULL,
  `reply_to` text,
  `template_html` text NOT NULL,
  `template_text` text,
  `smtp_vault_key` text NOT NULL DEFAULT 'SMTP_CONNECTION',
  `status` text NOT NULL DEFAULT 'draft',
  `total_contacts` integer NOT NULL DEFAULT 0,
  `sent_count` integer NOT NULL DEFAULT 0,
  `failed_count` integer NOT NULL DEFAULT 0,
  `settings` text,
  `error` text,
  `started_at` integer,
  `completed_at` integer,
  `created_by` text NOT NULL DEFAULT 'user',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_campaigns_status` ON `campaigns` (`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `campaign_contacts` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `email` text NOT NULL,
  `name` text,
  `variables` text,
  `status` text NOT NULL DEFAULT 'pending',
  `sent_at` integer,
  `error` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_campaign_contacts_campaign` ON `campaign_contacts` (`campaign_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_campaign_contacts_status` ON `campaign_contacts` (`campaign_id`, `status`);
