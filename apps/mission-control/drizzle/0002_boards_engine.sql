CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'kanban' NOT NULL,
	`columns` text NOT NULL,
	`owner` text DEFAULT 'user' NOT NULL,
	`squad` text,
	`settings` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`column` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`assignee` text,
	`labels` text,
	`priority` text DEFAULT 'medium',
	`due_date` integer,
	`checklist` text,
	`attachments` text,
	`parent_card_id` text,
	`story_id` text,
	`epic_id` text,
	`sprint_id` text,
	`progress` integer DEFAULT 0,
	`created_by` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`archived_at` integer
);
--> statement-breakpoint
CREATE TABLE `card_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`author` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `card_history` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`action` text NOT NULL,
	`by` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cards_board_id_idx` ON `cards` (`board_id`);
--> statement-breakpoint
CREATE INDEX `cards_assignee_idx` ON `cards` (`assignee`);
--> statement-breakpoint
CREATE INDEX `card_comments_card_id_idx` ON `card_comments` (`card_id`);
--> statement-breakpoint
CREATE INDEX `card_history_card_id_idx` ON `card_history` (`card_id`);
