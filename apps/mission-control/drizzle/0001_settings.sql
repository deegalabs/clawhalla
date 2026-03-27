CREATE TABLE IF NOT EXISTS `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL
);
