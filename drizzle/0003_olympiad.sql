CREATE TABLE `contest_paper` (
	`contest` text NOT NULL,
	`year` integer NOT NULL,
	`max_score` integer NOT NULL,
	`minutes` integer NOT NULL,
	`cutoff` text,
	`scores` text,
	PRIMARY KEY(`contest`, `year`)
);
--> statement-breakpoint
ALTER TABLE `mastery_snapshot` ADD `contest` text DEFAULT 'kangaroo' NOT NULL;--> statement-breakpoint
ALTER TABLE `practice_session` ADD `contest` text DEFAULT 'kangaroo' NOT NULL;--> statement-breakpoint
ALTER TABLE `profile` ADD `contests` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `olympiad` text;--> statement-breakpoint
ALTER TABLE `question` ADD `contest` text DEFAULT 'kangaroo' NOT NULL;--> statement-breakpoint
ALTER TABLE `question` ADD `part` text;--> statement-breakpoint
ALTER TABLE `question` ADD `points` integer;--> statement-breakpoint
ALTER TABLE `question` ADD `answer_type` text DEFAULT 'choice' NOT NULL;--> statement-breakpoint
ALTER TABLE `question` ADD `answer_spec` text;--> statement-breakpoint
ALTER TABLE `question` ADD `answer_unit` text;--> statement-breakpoint
ALTER TABLE `question` ADD `stats` text;--> statement-breakpoint
ALTER TABLE `question` ADD `difficulty` integer;--> statement-breakpoint
ALTER TABLE `question` ADD `official_path` text;--> statement-breakpoint
CREATE INDEX `question_contest_idx` ON `question` (`contest`,`year`);