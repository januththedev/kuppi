CREATE TABLE `resourceComments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resourceId` int NOT NULL,
	`authorId` int NOT NULL,
	`body` varchar(1000) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resourceComments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resourceLikes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resourceId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resourceLikes_id` PRIMARY KEY(`id`),
	CONSTRAINT `resource_like_unique` UNIQUE(`resourceId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `resourceSaves` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resourceId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resourceSaves_id` PRIMARY KEY(`id`),
	CONSTRAINT `resource_save_unique` UNIQUE(`resourceId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `resources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`authorId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text NOT NULL,
	`subject` varchar(80) NOT NULL,
	`studyLevel` varchar(40) NOT NULL,
	`stream` varchar(80),
	`examRelevance` varchar(100),
	`originalFileName` varchar(255) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` varchar(1024) NOT NULL,
	`mimeType` varchar(160) NOT NULL,
	`fileSize` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `resources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `studentUsers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fullName` varchar(120) NOT NULL,
	`contactNumber` varchar(32) NOT NULL,
	`username` varchar(32) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`role` enum('student','admin') NOT NULL DEFAULT 'student',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `studentUsers_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `resourceComments` ADD CONSTRAINT `resourceComments_resourceId_resources_id_fk` FOREIGN KEY (`resourceId`) REFERENCES `resources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resourceComments` ADD CONSTRAINT `resourceComments_authorId_studentUsers_id_fk` FOREIGN KEY (`authorId`) REFERENCES `studentUsers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resourceLikes` ADD CONSTRAINT `resourceLikes_resourceId_resources_id_fk` FOREIGN KEY (`resourceId`) REFERENCES `resources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resourceLikes` ADD CONSTRAINT `resourceLikes_userId_studentUsers_id_fk` FOREIGN KEY (`userId`) REFERENCES `studentUsers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resourceSaves` ADD CONSTRAINT `resourceSaves_resourceId_resources_id_fk` FOREIGN KEY (`resourceId`) REFERENCES `resources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resourceSaves` ADD CONSTRAINT `resourceSaves_userId_studentUsers_id_fk` FOREIGN KEY (`userId`) REFERENCES `studentUsers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resources` ADD CONSTRAINT `resources_authorId_studentUsers_id_fk` FOREIGN KEY (`authorId`) REFERENCES `studentUsers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `comments_resource_idx` ON `resourceComments` (`resourceId`);--> statement-breakpoint
CREATE INDEX `resources_author_idx` ON `resources` (`authorId`);--> statement-breakpoint
CREATE INDEX `resources_subject_idx` ON `resources` (`subject`);--> statement-breakpoint
CREATE INDEX `resources_level_idx` ON `resources` (`studyLevel`);