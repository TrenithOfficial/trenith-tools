CREATE TABLE `watch_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `watch_rate_limits_reset_idx` ON `watch_rate_limits` (`reset_at`);