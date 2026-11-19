CREATE TABLE `profile_photo` (
	`profile_id` integer PRIMARY KEY NOT NULL,
	`png` blob NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `profile` ADD `photo_at` integer;