CREATE TABLE `watch_events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`target_id` text,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `watch_events_room_seq_idx` ON `watch_events` (`room_id`,`seq`);--> statement-breakpoint
CREATE INDEX `watch_events_expires_idx` ON `watch_events` (`expires_at`);--> statement-breakpoint
CREATE TABLE `watch_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'guest' NOT NULL,
	`joined_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `watch_participants_room_idx` ON `watch_participants` (`room_id`);--> statement-breakpoint
CREATE INDEX `watch_participants_seen_idx` ON `watch_participants` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `watch_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`invite_proof_hash` text NOT NULL,
	`host_participant_id` text NOT NULL,
	`provider` text NOT NULL,
	`control_mode` text DEFAULT 'host' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE INDEX `watch_rooms_expires_idx` ON `watch_rooms` (`expires_at`);