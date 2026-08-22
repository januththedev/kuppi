import { and, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import {
  resourceComments,
  contentReports,
  resourceLikes,
  resources,
  resourceSaves,
  resourceProgress,
  resourceViews,
  studentUsers,
  type Resource,
} from "../drizzle/schema";
import { getDb } from "./db";
import { buildContributionRanking } from "./contributionRank";

type ResourceRow = { resource: Resource; author: typeof studentUsers.$inferSelect };

export function publicStudent(student: typeof studentUsers.$inferSelect) {
  return { id: student.id, fullName: student.fullName, username: student.username, role: student.role, createdAt: student.createdAt };
}

export async function getStudentById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.select().from(studentUsers).where(eq(studentUsers.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getStudentByUsername(username: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.select().from(studentUsers).where(eq(studentUsers.username, username)).limit(1);
  return result[0] ?? null;
}

export async function createStudent(input: { fullName: string; contactNumber: string; username: string; passwordHash: string; contactVerifiedAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(studentUsers).values(input);
  const student = await getStudentByUsername(input.username);
  if (!student) throw new Error("Account could not be created");
  return student;
}

export async function updateStudentSignIn(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(studentUsers).set({ lastSignedIn: new Date() }).where(eq(studentUsers.id, id));
}

export async function updateStudentPassword(id: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(studentUsers).set({ passwordHash }).where(eq(studentUsers.id, id));
}

function countMap(rows: { resourceId: number; total: unknown }[]) {
  return new Map(rows.map((row) => [row.resourceId, Number(row.total)]));
}

async function decorateResources(rows: ResourceRow[], viewerId?: number) {
  if (!rows.length) return [];
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const ids = rows.map((row) => row.resource.id);
  const [likes, saves, viewerLikes, viewerSaves, commentCounts] = await Promise.all([
    db.select({ resourceId: resourceLikes.resourceId, total: sql<number>`count(*)` }).from(resourceLikes).where(inArray(resourceLikes.resourceId, ids)).groupBy(resourceLikes.resourceId),
    db.select({ resourceId: resourceSaves.resourceId, total: sql<number>`count(*)` }).from(resourceSaves).where(inArray(resourceSaves.resourceId, ids)).groupBy(resourceSaves.resourceId),
    viewerId ? db.select({ resourceId: resourceLikes.resourceId }).from(resourceLikes).where(and(eq(resourceLikes.userId, viewerId), inArray(resourceLikes.resourceId, ids))) : Promise.resolve([]),
    viewerId ? db.select({ resourceId: resourceSaves.resourceId }).from(resourceSaves).where(and(eq(resourceSaves.userId, viewerId), inArray(resourceSaves.resourceId, ids))) : Promise.resolve([]),
    db.select({ resourceId: resourceComments.resourceId, total: sql<number>`count(*)` }).from(resourceComments).where(inArray(resourceComments.resourceId, ids)).groupBy(resourceComments.resourceId),
  ]);
  const likeCounts = countMap(likes);
  const saveCounts = countMap(saves);
  const commentCountMap = countMap(commentCounts);
  const likedIds = new Set(viewerLikes.map((item) => item.resourceId));
  const savedIds = new Set(viewerSaves.map((item) => item.resourceId));
  return rows.map(({ resource, author }) => ({
    ...resource,
    author: publicStudent(author),
    likeCount: likeCounts.get(resource.id) ?? 0,
    saveCount: saveCounts.get(resource.id) ?? 0,
    commentCount: commentCountMap.get(resource.id) ?? 0,
    viewerHasLiked: likedIds.has(resource.id),
    viewerHasSaved: savedIds.has(resource.id),
  }));
}

export async function listResources(input: { query?: string; subject?: string; studyLevel?: string }, viewerId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const clauses = [];
  const query = input.query?.trim();
  if (query) {
    const term = `%${query.replace(/[%_]/g, "\\$&")}%`;
    clauses.push(or(like(resources.title, term), like(resources.description, term), like(resources.subject, term), like(resources.stream, term))!);
  }
  if (input.subject && input.subject !== "All") clauses.push(eq(resources.subject, input.subject));
  if (input.studyLevel && input.studyLevel !== "All") clauses.push(eq(resources.studyLevel, input.studyLevel));
  clauses.push(eq(resources.moderationStatus, "published"));
  const rows = await db.select({ resource: resources, author: studentUsers }).from(resources).innerJoin(studentUsers, eq(resources.authorId, studentUsers.id)).where(and(...clauses)).orderBy(desc(resources.createdAt)).limit(60);
  return decorateResources(rows, viewerId);
}

export async function getResourceById(id: number, viewerId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select({ resource: resources, author: studentUsers }).from(resources).innerJoin(studentUsers, eq(resources.authorId, studentUsers.id)).where(and(eq(resources.id, id), eq(resources.moderationStatus, "published"))).limit(1);
  const decorated = await decorateResources(rows, viewerId);
  return decorated[0] ?? null;
}

export async function getResourceByStorageUrl(storageUrl: string, viewerId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select({ resource: resources, author: studentUsers }).from(resources).innerJoin(studentUsers, eq(resources.authorId, studentUsers.id)).where(and(eq(resources.storageUrl, storageUrl), eq(resources.moderationStatus, "published"))).limit(1);
  const decorated = await decorateResources(rows, viewerId);
  return decorated[0] ?? null;
}

export async function listRelatedResources(resourceId: number, viewerId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const current = await db.select({ subject: resources.subject, studyLevel: resources.studyLevel }).from(resources).where(and(eq(resources.id, resourceId), eq(resources.moderationStatus, "published"))).limit(1);
  if (!current[0]) return [];
  const rows = await db.select({ resource: resources, author: studentUsers }).from(resources).innerJoin(studentUsers, eq(resources.authorId, studentUsers.id)).where(and(eq(resources.moderationStatus, "published"), ne(resources.id, resourceId), eq(resources.subject, current[0].subject), eq(resources.studyLevel, current[0].studyLevel))).orderBy(desc(resources.createdAt)).limit(4);
  return decorateResources(rows, viewerId);
}

export async function markResourceViewed(resourceId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const existing = await db.select({ id: resourceViews.id }).from(resourceViews).where(and(eq(resourceViews.resourceId, resourceId), eq(resourceViews.userId, userId))).limit(1);
  if (existing[0]) await db.update(resourceViews).set({ viewedAt: new Date() }).where(eq(resourceViews.id, existing[0].id));
  else await db.insert(resourceViews).values({ resourceId, userId });
}

export async function listRelatedResourcesByStorageUrl(storageUrl: string, viewerId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const current = await db.select({ id: resources.id }).from(resources).where(and(eq(resources.storageUrl, storageUrl), eq(resources.moderationStatus, "published"))).limit(1);
  return current[0] ? listRelatedResources(current[0].id, viewerId) : [];
}

export async function markResourceViewedByStorageUrl(storageUrl: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const resource = await db.select({ id: resources.id }).from(resources).where(and(eq(resources.storageUrl, storageUrl), eq(resources.moderationStatus, "published"))).limit(1);
  if (!resource[0]) throw new Error("That resource is no longer available.");
  await markResourceViewed(resource[0].id, userId);
}

export async function createResource(input: Omit<typeof resources.$inferInsert, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(resources).values(input);
  const row = await db.select({ resource: resources, author: studentUsers }).from(resources).innerJoin(studentUsers, eq(resources.authorId, studentUsers.id)).where(eq(resources.storageKey, input.storageKey)).limit(1);
  if (!row[0]) throw new Error("Resource could not be saved");
  return row[0];
}

export async function toggleResourceLike(resourceId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const current = await db.select({ id: resourceLikes.id }).from(resourceLikes).where(and(eq(resourceLikes.resourceId, resourceId), eq(resourceLikes.userId, userId))).limit(1);
  if (current[0]) {
    await db.delete(resourceLikes).where(eq(resourceLikes.id, current[0].id));
    return false;
  }
  await db.insert(resourceLikes).values({ resourceId, userId });
  return true;
}

export async function toggleResourceSave(resourceId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const current = await db.select({ id: resourceSaves.id }).from(resourceSaves).where(and(eq(resourceSaves.resourceId, resourceId), eq(resourceSaves.userId, userId))).limit(1);
  if (current[0]) {
    await db.delete(resourceSaves).where(eq(resourceSaves.id, current[0].id));
    return false;
  }
  await db.insert(resourceSaves).values({ resourceId, userId });
  return true;
}

export async function listComments(resourceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select({ comment: resourceComments, author: studentUsers }).from(resourceComments).innerJoin(studentUsers, eq(resourceComments.authorId, studentUsers.id)).where(and(eq(resourceComments.resourceId, resourceId), eq(resourceComments.moderationStatus, "published"))).orderBy(desc(resourceComments.createdAt));
  return rows.map(({ comment, author }) => ({ ...comment, author: publicStudent(author) }));
}

export async function addComment(resourceId: number, authorId: number, body: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(resourceComments).values({ resourceId, authorId, body });
  const rows = await listComments(resourceId);
  return rows[0] ?? null;
}

export async function getDashboard(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [student, ownRows, savedRows, recentViewRows, progressRows, allStudents, allResources, allLikes, rankedStudentRows] = await Promise.all([
    getStudentById(userId),
    db.select({ resource: resources, author: studentUsers }).from(resources).innerJoin(studentUsers, eq(resources.authorId, studentUsers.id)).where(eq(resources.authorId, userId)).orderBy(desc(resources.createdAt)),
    db.select({ resource: resources, author: studentUsers }).from(resourceSaves).innerJoin(resources, eq(resourceSaves.resourceId, resources.id)).innerJoin(studentUsers, eq(resources.authorId, studentUsers.id)).where(eq(resourceSaves.userId, userId)).orderBy(desc(resourceSaves.createdAt)),
    db.select({ resource: resources, author: studentUsers }).from(resourceViews).innerJoin(resources, eq(resourceViews.resourceId, resources.id)).innerJoin(studentUsers, eq(resources.authorId, studentUsers.id)).where(and(eq(resourceViews.userId, userId), eq(resources.moderationStatus, "published"))).orderBy(desc(resourceViews.viewedAt)).limit(8),
    db.select().from(resourceProgress).where(eq(resourceProgress.userId, userId)),
    db.select().from(studentUsers),
    db.select({ id: resources.id, authorId: resources.authorId }).from(resources),
    db.select({ resourceId: resourceLikes.resourceId }).from(resourceLikes),
    db.select({ total: sql<number>`count(distinct ${resources.authorId})` }).from(resources),
  ]);
  if (!student) throw new Error("Student account was not found");
  const { scores, ranking } = buildContributionRanking(allStudents.map((person) => person.id), allResources, allLikes);
  const currentRank = ranking.findIndex((entry) => entry.userId === userId);
  return {
    student: publicStudent(student),
    contributions: await decorateResources(ownRows, userId),
    saved: await decorateResources(savedRows, userId),
    recentlyViewed: (await decorateResources(recentViewRows, userId)).map((resource) => ({ ...resource, progressPercent: progressRows.find((item) => item.resourceId === resource.id)?.progressPercent ?? 0, lastPage: progressRows.find((item) => item.resourceId === resource.id)?.lastPage ?? 1 })),
    stats: {
      uploadCount: ownRows.length,
      savedCount: savedRows.length,
      contributionScore: scores.get(userId) ?? 0,
      currentRank: currentRank >= 0 ? currentRank + 1 : null,
      rankedStudents: Number(rankedStudentRows[0]?.total ?? 0),
    },
  };
}
