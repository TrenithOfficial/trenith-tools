ALTER TABLE `watch_participants` ADD `removed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `watch_rooms` ADD `locked` integer DEFAULT false NOT NULL;