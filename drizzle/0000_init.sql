CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attempt` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer,
	`profile_id` integer NOT NULL,
	`question_id` text NOT NULL,
	`choice` text,
	`correct` integer NOT NULL,
	`time_ms` integer,
	`hint_used` integer DEFAULT false NOT NULL,
	`flagged` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'app' NOT NULL,
	`answered_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `practice_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `question`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attempt_profile_idx` ON `attempt` (`profile_id`,`answered_at`);--> statement-breakpoint
CREATE INDEX `attempt_question_idx` ON `attempt` (`question_id`);--> statement-breakpoint
CREATE TABLE `login_session` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`profile_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `login_session_profile_idx` ON `login_session` (`profile_id`);--> statement-breakpoint
CREATE TABLE `mastery_snapshot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`focus_area` text NOT NULL,
	`level` text NOT NULL,
	`weighted_accuracy` real NOT NULL,
	`attempts` integer NOT NULL,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mastery_profile_idx` ON `mastery_snapshot` (`profile_id`,`computed_at`);--> statement-breakpoint
CREATE TABLE `practice_session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`mode` text NOT NULL,
	`settings` text NOT NULL,
	`paper_year` integer,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`score` real,
	`max_score` real,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `practice_session_profile_idx` ON `practice_session` (`profile_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nickname` text NOT NULL,
	`avatar` text NOT NULL,
	`role` text NOT NULL,
	`grade` text,
	`birth_year` integer,
	`pin_hash` text NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_nickname_uq` ON `profile` (`nickname`);--> statement-breakpoint
CREATE TABLE `question` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`year` integer NOT NULL,
	`number` integer NOT NULL,
	`questions_in_paper` integer NOT NULL,
	`tier` text NOT NULL,
	`focus_primary` text NOT NULL,
	`focus_secondary` text,
	`answer` text NOT NULL,
	`image_path` text NOT NULL,
	`text` text NOT NULL,
	`hint_en` text,
	`solution_en` text,
	`void_note` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `question_year_idx` ON `question` (`level`,`year`,`number`);--> statement-breakpoint
CREATE INDEX `question_focus_idx` ON `question` (`focus_primary`);--> statement-breakpoint
CREATE TABLE `review_item` (
	`profile_id` integer NOT NULL,
	`question_id` text NOT NULL,
	`box` integer NOT NULL,
	`due_at` integer NOT NULL,
	`streak` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`profile_id`, `question_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `question`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session_question` (
	`session_id` integer NOT NULL,
	`position` integer NOT NULL,
	`question_id` text NOT NULL,
	PRIMARY KEY(`session_id`, `position`),
	FOREIGN KEY (`session_id`) REFERENCES `practice_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `question`(`id`) ON UPDATE no action ON DELETE no action
);
