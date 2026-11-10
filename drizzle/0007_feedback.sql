CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`question_id` text,
	`session_id` integer,
	`kind` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`reply` text,
	`replied_at` integer,
	`reply_seen_at` integer,
	`done_at` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `question`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `practice_session`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `feedback_profile_idx` ON `feedback` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_open_idx` ON `feedback` (`done_at`,`created_at`);