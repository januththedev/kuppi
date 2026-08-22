CREATE TABLE `resourceViews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resourceId` int NOT NULL,
	`userId` int NOT NULL,
	`viewedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `resourceViews_id` PRIMARY KEY(`id`),
	CONSTRAINT `resource_view_unique` UNIQUE(`resourceId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `resourceViews` ADD CONSTRAINT `resourceViews_resourceId_resources_id_fk` FOREIGN KEY (`resourceId`) REFERENCES `resources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resourceViews` ADD CONSTRAINT `resourceViews_userId_studentUsers_id_fk` FOREIGN KEY (`userId`) REFERENCES `studentUsers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `resource_views_user_date_idx` ON `resourceViews` (`userId`,`viewedAt`);