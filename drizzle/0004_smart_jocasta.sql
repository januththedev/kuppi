CREATE TABLE `quizAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quizId` int NOT NULL,
	`userId` int NOT NULL,
	`answersJson` text NOT NULL,
	`score` int NOT NULL,
	`total` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quizAttempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resourceProgress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resourceId` int NOT NULL,
	`userId` int NOT NULL,
	`progressPercent` int NOT NULL DEFAULT 0,
	`lastPage` int NOT NULL DEFAULT 1,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `resourceProgress_id` PRIMARY KEY(`id`),
	CONSTRAINT `resource_progress_unique` UNIQUE(`resourceId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `resourceQuizzes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resourceId` int NOT NULL,
	`creatorId` int NOT NULL,
	`questionsJson` text NOT NULL,
	`questionCount` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resourceQuizzes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `quizAttempts` ADD CONSTRAINT `quizAttempts_quizId_resourceQuizzes_id_fk` FOREIGN KEY (`quizId`) REFERENCES `resourceQuizzes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quizAttempts` ADD CONSTRAINT `quizAttempts_userId_studentUsers_id_fk` FOREIGN KEY (`userId`) REFERENCES `studentUsers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resourceProgress` ADD CONSTRAINT `resourceProgress_resourceId_resources_id_fk` FOREIGN KEY (`resourceId`) REFERENCES `resources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resourceProgress` ADD CONSTRAINT `resourceProgress_userId_studentUsers_id_fk` FOREIGN KEY (`userId`) REFERENCES `studentUsers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resourceQuizzes` ADD CONSTRAINT `resourceQuizzes_resourceId_resources_id_fk` FOREIGN KEY (`resourceId`) REFERENCES `resources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resourceQuizzes` ADD CONSTRAINT `resourceQuizzes_creatorId_studentUsers_id_fk` FOREIGN KEY (`creatorId`) REFERENCES `studentUsers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `quiz_attempts_user_date_idx` ON `quizAttempts` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `resource_progress_user_date_idx` ON `resourceProgress` (`userId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `resource_quizzes_resource_idx` ON `resourceQuizzes` (`resourceId`);