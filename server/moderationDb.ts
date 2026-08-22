import { desc, eq } from "drizzle-orm";
import { contentReports, resourceComments, resources, studentUsers } from "../drizzle/schema";
import { getDb } from "./db";
import { publicStudent } from "./kuppiDb";
import { moderationResolution } from "./moderationPolicy";

export async function createContentReport(input: {
  reporterId: number;
  targetType: "resource" | "comment";
  targetId: number;
  reason: string;
  details?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(contentReports).values({ ...input, details: input.details || null });
}

export async function listModerationReports() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db
    .select({ report: contentReports, reporter: studentUsers })
    .from(contentReports)
    .innerJoin(studentUsers, eq(contentReports.reporterId, studentUsers.id))
    .orderBy(desc(contentReports.createdAt));
  return rows.map(({ report, reporter }) => ({ ...report, reporter: publicStudent(reporter) }));
}

export async function resolveModerationReport(input: {
  reportId: number;
  reviewerId: number;
  action: "dismiss" | "hide" | "remove";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const report = await db.select().from(contentReports).where(eq(contentReports.id, input.reportId)).limit(1);
  if (!report[0]) throw new Error("Report not found");
  const resolution = moderationResolution(input.action);
  if (resolution.moderationStatus) {
    if (report[0].targetType === "resource") {
      await db.update(resources).set({ moderationStatus: resolution.moderationStatus }).where(eq(resources.id, report[0].targetId));
    } else {
      await db.update(resourceComments).set({ moderationStatus: resolution.moderationStatus }).where(eq(resourceComments.id, report[0].targetId));
    }
  }
  await db.update(contentReports).set({
    status: resolution.reportStatus,
    resolvedById: input.reviewerId,
    resolvedAt: new Date(),
  }).where(eq(contentReports.id, input.reportId));
}
