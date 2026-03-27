CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`action` text NOT NULL,
	`target` text,
	`details` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`tier` integer NOT NULL,
	`squad` text,
	`model` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`emoji` text,
	`reports_to` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`approver` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`command` text,
	`reason` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE TABLE `cost_events` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`model` text NOT NULL,
	`action` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost_cents` integer DEFAULT 0 NOT NULL,
	`task_id` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `epics` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`approved_by` text,
	`priority` text DEFAULT 'medium',
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`squad` text,
	`start_date` integer,
	`end_date` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`encrypted_value` text NOT NULL,
	`iv` text NOT NULL,
	`category` text DEFAULT 'api_key' NOT NULL,
	`created_by` text DEFAULT 'daniel' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_accessed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `secrets_name_unique` ON `secrets` (`name`);--> statement-breakpoint
CREATE TABLE `sprints` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'planning' NOT NULL,
	`start_date` text,
	`end_date` text,
	`story_ids` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`epic_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'backlog' NOT NULL,
	`points` integer,
	`assigned_to` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'backlog' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`assigned_to` text,
	`project_id` text,
	`story_id` text,
	`sprint_id` text,
	`estimated_hours` integer,
	`actual_hours` integer,
	`tags` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `workspace_files` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`type` text NOT NULL,
	`size` integer,
	`last_modified` integer NOT NULL,
	`created_at` integer NOT NULL
);
