import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Existing platform user record retained for framework compatibility. Kuppi uses the studentUsers table below. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const studentUsers = mysqlTable(
  "studentUsers",
  {
    id: int("id").autoincrement().primaryKey(),
    fullName: varchar("fullName", { length: 120 }).notNull(),
    contactNumber: varchar("contactNumber", { length: 32 }).notNull(),
    username: varchar("username", { length: 32 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    contactVerifiedAt: timestamp("contactVerifiedAt"),
    role: mysqlEnum("role", ["student", "admin"]).default("student").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("student_users_username_unique").on(table.username)],
);

export const resources = mysqlTable(
  "resources",
  {
    id: int("id").autoincrement().primaryKey(),
    authorId: int("authorId").notNull().references(() => studentUsers.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    subject: varchar("subject", { length: 80 }).notNull(),
    studyLevel: varchar("studyLevel", { length: 40 }).notNull(),
    stream: varchar("stream", { length: 80 }),
    examRelevance: varchar("examRelevance", { length: 100 }),
    originalFileName: varchar("originalFileName", { length: 255 }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    storageUrl: varchar("storageUrl", { length: 1024 }).notNull(),
    mimeType: varchar("mimeType", { length: 160 }).notNull(),
    fileSize: int("fileSize").notNull(),
    moderationStatus: mysqlEnum("moderationStatus", ["published", "hidden", "removed"]).default("published").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("resources_author_idx").on(table.authorId),
    index("resources_subject_idx").on(table.subject),
    index("resources_level_idx").on(table.studyLevel),
  ],
);

export const resourceComments = mysqlTable(
  "resourceComments",
  {
    id: int("id").autoincrement().primaryKey(),
    resourceId: int("resourceId").notNull().references(() => resources.id, { onDelete: "cascade" }),
    authorId: int("authorId").notNull().references(() => studentUsers.id, { onDelete: "cascade" }),
    body: varchar("body", { length: 1000 }).notNull(),
    moderationStatus: mysqlEnum("moderationStatus", ["published", "hidden", "removed"]).default("published").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("comments_resource_idx").on(table.resourceId)],
);

export const resourceSaves = mysqlTable(
  "resourceSaves",
  {
    id: int("id").autoincrement().primaryKey(),
    resourceId: int("resourceId").notNull().references(() => resources.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => studentUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("resource_save_unique").on(table.resourceId, table.userId)],
);

export const resourceLikes = mysqlTable(
  "resourceLikes",
  {
    id: int("id").autoincrement().primaryKey(),
    resourceId: int("resourceId").notNull().references(() => resources.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => studentUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("resource_like_unique").on(table.resourceId, table.userId)],
);

export const contentReports = mysqlTable(
  "contentReports",
  {
    id: int("id").autoincrement().primaryKey(),
    reporterId: int("reporterId").notNull().references(() => studentUsers.id, { onDelete: "cascade" }),
    targetType: mysqlEnum("targetType", ["resource", "comment"]).notNull(),
    targetId: int("targetId").notNull(),
    reason: varchar("reason", { length: 120 }).notNull(),
    details: text("details"),
    status: mysqlEnum("status", ["open", "dismissed", "actioned"]).default("open").notNull(),
    resolvedById: int("resolvedById").references(() => studentUsers.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("reports_status_idx").on(table.status),
    index("reports_target_idx").on(table.targetType, table.targetId),
    index("reports_reporter_idx").on(table.reporterId),
  ],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type StudentUser = typeof studentUsers.$inferSelect;
export type Resource = typeof resources.$inferSelect;
