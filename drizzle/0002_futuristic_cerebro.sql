CREATE TABLE `contentReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterId` int NOT NULL,
	`targetType` enum('resource','comment') NOT NULL,
	`targetId` int NOT NULL,
	`reason` varchar(120) NOT NULL,
	`details` text,
	`status` enum('open','dismissed','actioned') NOT NULL DEFAULT 'open',
	`resolvedById` int,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contentReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `resourceComments` ADD `moderationStatus` enum('published','hidden','removed') DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE `resources` ADD `moderationStatus` enum('published','hidden','removed') DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE `studentUsers` ADD `contactVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `contentReports` ADD CONSTRAINT `contentReports_reporterId_studentUsers_id_fk` FOREIGN KEY (`reporterId`) REFERENCES `studentUsers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contentReports` ADD CONSTRAINT `contentReports_resolvedById_studentUsers_id_fk` FOREIGN KEY (`resolvedById`) REFERENCES `studentUsers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `contentReports` (`status`);--> statement-breakpoint
CREATE INDEX `reports_target_idx` ON `contentReports` (`targetType`,`targetId`);--> statement-breakpoint
CREATE INDEX `reports_reporter_idx` ON `contentReports` (`reporterId`);