CREATE TABLE `usage_count` (
	`profile_id` integer NOT NULL,
	`day` text NOT NULL,
	`key` text NOT NULL,
	`n` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `day`, `key`),
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `usage_device` (
	`profile_id` integer NOT NULL,
	`day` text NOT NULL,
	`browser` text NOT NULL,
	`os` text NOT NULL,
	`device` text NOT NULL,
	`visits` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `day`, `browser`, `os`, `device`),
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `attempt` ADD `scratch_used` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `attempt` ADD `pick_changes` integer DEFAULT 0 NOT NULL;