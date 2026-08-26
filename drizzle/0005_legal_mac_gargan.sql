CREATE TABLE `resourceTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resourceId` int NOT NULL,
	`tag` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resourceTags_id` PRIMARY KEY(`id`),
	CONSTRAINT `resource_tag_unique` UNIQUE(`resourceId`,`tag`)
);
--> statement-breakpoint
ALTER TABLE `resources` ADD `extractedText` mediumtext;--> statement-breakpoint
ALTER TABLE `resources` ADD `extractedAt` timestamp;--> statement-breakpoint
ALTER TABLE `resourceTags` ADD CONSTRAINT `resourceTags_resourceId_resources_id_fk` FOREIGN KEY (`resourceId`) REFERENCES `resources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `resource_tags_tag_idx` ON `resourceTags` (`tag`);--> statement-breakpoint
CREATE INDEX `resource_tags_resource_idx` ON `resourceTags` (`resourceId`);