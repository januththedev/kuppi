import { and, desc, eq } from "drizzle-orm";
import { quizAttempts, resourceProgress, resourceQuizzes } from "../drizzle/schema";
import { getDb } from "./db";

export async function upsertProgress(resourceId: number, userId: number, progressPercent: number, lastPage: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const existing = await db.select({ id: resourceProgress.id }).from(resourceProgress).where(and(eq(resourceProgress.resourceId, resourceId), eq(resourceProgress.userId, userId))).limit(1);
  if (existing[0]) await db.update(resourceProgress).set({ progressPercent, lastPage, updatedAt: new Date() }).where(eq(resourceProgress.id, existing[0].id)); else await db.insert(resourceProgress).values({ resourceId, userId, progressPercent, lastPage });
}

export async function createQuiz(resourceId: number, creatorId: number, questionsJson: string, questionCount: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(resourceQuizzes).values({ resourceId, creatorId, questionsJson, questionCount });
  const quiz = await db.select().from(resourceQuizzes).where(and(eq(resourceQuizzes.resourceId, resourceId), eq(resourceQuizzes.creatorId, creatorId))).orderBy(desc(resourceQuizzes.createdAt)).limit(1);
  return quiz[0];
}

export async function recordQuizAttempt(quizId: number, userId: number, answersJson: string, score: number, total: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(quizAttempts).values({ quizId, userId, answersJson, score, total });
}
