import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  addComment,
  createResource,
  createStudent,
  getDashboard,
  getResourceById,
  getResourceByStorageUrl,
  getStudentByUsername,
  listComments,
  listRelatedResources,
  listRelatedResourcesByStorageUrl,
  listResources,
  markResourceViewed,
  markResourceViewedByStorageUrl,
  publicStudent,
  toggleResourceLike,
  toggleResourceSave,
  updateStudentPassword,
  updateStudentSignIn,
} from "./kuppiDb";
import {
  clearStudentSession,
  getStudentFromRequest,
  hashPassword,
  matchesRecoveryIdentity,
  normalizePhoneNumber,
  normalizeUsername,
  registrationValidationMessage,
  setStudentSession,
  verifyPassword,
} from "./kuppiAuth";
import { storagePut } from "./storage";
import { MAX_BASE64_LENGTH, safeStorageName, validateResourceUpload } from "./resourceSafety";
import { createContentReport, listModerationReports, resolveModerationReport } from "./moderationDb";
import { generateOpenRouterMcq } from "./openRouterQuiz";
import { createQuiz, recordQuizAttempt, upsertProgress } from "./quizDb";
import { extractResourceText } from "./resourceTextExtraction";

async function requireStudent(request: Parameters<typeof getStudentFromRequest>[0]) {
  const student = await getStudentFromRequest(request);
  if (!student) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in to continue." });
  return student;
}

async function requireAdmin(request: Parameters<typeof getStudentFromRequest>[0]) {
  const student = await requireStudent(request);
  if (student.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access is required." });
  return student;
}

const idInput = z.object({ id: z.number().int().positive() });

export const appRouter = router({
  system: systemRouter,
  // Compatibility surface for the inherited client hook. Kuppi authentication is handled by account.* below.
  auth: router({
    me: publicProcedure.query(() => null),
    logout: publicProcedure.mutation(({ ctx }) => {
      clearStudentSession(ctx.res);
      return { success: true } as const;
    }),
  }),
  account: router({
    me: publicProcedure.query(async ({ ctx }) => {
      const student = await getStudentFromRequest(ctx.req);
      return student ? publicStudent(student) : null;
    }),
    usernameAvailable: publicProcedure.input(z.object({ username: z.string().max(32) })).query(async ({ input }) => {
      const username = normalizeUsername(input.username);
      if (!/^[a-z0-9_]{3,32}$/.test(username)) return { available: false, normalizedUsername: username, message: "Use 3–32 lowercase letters, numbers, or underscores." };
      const existing = await getStudentByUsername(username);
      return { available: !existing, normalizedUsername: username, message: existing ? "That username is already taken." : "Username is available." };
    }),
    register: publicProcedure.input(z.object({ fullName: z.string().max(120), contactNumber: z.string().max(32), username: z.string().max(32), password: z.string().max(128), confirmPassword: z.string().max(128) })).mutation(async ({ ctx, input }) => {
      const validation = registrationValidationMessage(input);
      if (validation) throw new TRPCError({ code: "BAD_REQUEST", message: validation });
      const username = normalizeUsername(input.username);
      if (await getStudentByUsername(username)) throw new TRPCError({ code: "CONFLICT", message: "That username is already taken." });
      const student = await createStudent({ fullName: input.fullName.trim(), contactNumber: normalizePhoneNumber(input.contactNumber), username, passwordHash: await hashPassword(input.password) });
      await setStudentSession(ctx.res, student);
      return publicStudent(student);
    }),
    login: publicProcedure.input(z.object({ username: z.string().max(32), password: z.string().max(128) })).mutation(async ({ ctx, input }) => {
      const student = await getStudentByUsername(normalizeUsername(input.username));
      if (!student || !(await verifyPassword(input.password, student.passwordHash))) throw new TRPCError({ code: "UNAUTHORIZED", message: "Username or password is incorrect." });
      await updateStudentSignIn(student.id);
      await setStudentSession(ctx.res, student);
      return publicStudent(student);
    }),
    recoverPassword: publicProcedure.input(z.object({ fullName: z.string().trim().min(2).max(120), contactNumber: z.string().trim().min(7).max(32), username: z.string().trim().min(3).max(32), password: z.string().min(8).max(128), confirmPassword: z.string().min(8).max(128) })).mutation(async ({ input }) => {
      if (input.password !== input.confirmPassword) throw new TRPCError({ code: "BAD_REQUEST", message: "Passwords do not match." });
      const student = await getStudentByUsername(normalizeUsername(input.username));
      if (!student || !matchesRecoveryIdentity(student, input)) throw new TRPCError({ code: "BAD_REQUEST", message: "The recovery details could not be verified." });
      await updateStudentPassword(student.id, await hashPassword(input.password));
      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      clearStudentSession(ctx.res);
      return { success: true } as const;
    }),
  }),
  resource: router({
    list: publicProcedure.input(z.object({ query: z.string().max(180).optional(), subject: z.string().max(80).optional(), studyLevel: z.string().max(40).optional() }).optional()).query(async ({ ctx, input }) => {
      const viewer = await getStudentFromRequest(ctx.req);
      return listResources(input ?? {}, viewer?.id);
    }),
    byId: publicProcedure.input(idInput).query(async ({ ctx, input }) => {
      const viewer = await getStudentFromRequest(ctx.req);
      const resource = await getResourceById(input.id, viewer?.id);
      if (!resource) throw new TRPCError({ code: "NOT_FOUND", message: "That resource is no longer available." });
      return resource;
    }),
    related: publicProcedure.input(idInput).query(async ({ ctx, input }) => {
      const viewer = await getStudentFromRequest(ctx.req);
      return listRelatedResources(input.id, viewer?.id);
    }),
    relatedByUrl: publicProcedure.input(z.object({ storageUrl: z.string().url().max(1024) })).query(async ({ ctx, input }) => {
      const viewer = await getStudentFromRequest(ctx.req);
      return listRelatedResourcesByStorageUrl(input.storageUrl, viewer?.id);
    }),
    markViewed: publicProcedure.input(idInput).mutation(async ({ ctx, input }) => {
      const student = await requireStudent(ctx.req);
      if (!await getResourceById(input.id, student.id)) throw new TRPCError({ code: "NOT_FOUND", message: "That resource is no longer available." });
      await markResourceViewed(input.id, student.id);
      return { success: true } as const;
    }),
    markViewedByUrl: publicProcedure.input(z.object({ storageUrl: z.string().url().max(1024) })).mutation(async ({ ctx, input }) => {
      const student = await requireStudent(ctx.req);
      await markResourceViewedByStorageUrl(input.storageUrl, student.id);
      return { success: true } as const;
    }),
    create: publicProcedure.input(z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().min(3).max(5000), subject: z.string().trim().min(2).max(80), studyLevel: z.string().trim().min(2).max(40), stream: z.string().trim().max(80).optional(), examRelevance: z.string().trim().max(100).optional(), originalFileName: z.string().trim().min(1).max(255), mimeType: z.string().trim().max(160).optional(), dataBase64: z.string().min(1).max(MAX_BASE64_LENGTH) })).mutation(async ({ ctx, input }) => {
      const student = await requireStudent(ctx.req);
      const buffer = Buffer.from(input.dataBase64, "base64");
      const uploadValidation = validateResourceUpload({ originalFileName: input.originalFileName, base64Length: input.dataBase64.length, byteLength: buffer.length });
      if (uploadValidation) throw new TRPCError({ code: uploadValidation.includes("25 MB") ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST", message: uploadValidation });
      const contentType = input.mimeType || "application/octet-stream";
      const stored = await storagePut(`kuppi/${student.id}/resources/${safeStorageName(input.originalFileName)}`, buffer, contentType);
      const created = await createResource({ authorId: student.id, title: input.title, description: input.description, subject: input.subject, studyLevel: input.studyLevel, stream: input.stream || null, examRelevance: input.examRelevance || null, originalFileName: input.originalFileName, storageKey: stored.key, storageUrl: stored.url, mimeType: contentType, fileSize: buffer.length });
      const resource = await getResourceById(created.resource.id, student.id);
      return resource;
    }),
    toggleLike: publicProcedure.input(idInput).mutation(async ({ ctx, input }) => {
      const student = await requireStudent(ctx.req);
      if (!await getResourceById(input.id, student.id)) throw new TRPCError({ code: "NOT_FOUND", message: "That resource is no longer available." });
      return { liked: await toggleResourceLike(input.id, student.id) };
    }),
    toggleSave: publicProcedure.input(idInput).mutation(async ({ ctx, input }) => {
      const student = await requireStudent(ctx.req);
      if (!await getResourceById(input.id, student.id)) throw new TRPCError({ code: "NOT_FOUND", message: "That resource is no longer available." });
      return { saved: await toggleResourceSave(input.id, student.id) };
    }),
    comments: publicProcedure.input(idInput).query(({ input }) => listComments(input.id)),
    addComment: publicProcedure.input(z.object({ resourceId: z.number().int().positive(), body: z.string().trim().min(1).max(1000) })).mutation(async ({ ctx, input }) => {
      const student = await requireStudent(ctx.req);
      if (!await getResourceById(input.resourceId, student.id)) throw new TRPCError({ code: "NOT_FOUND", message: "That resource is no longer available." });
      return addComment(input.resourceId, student.id, input.body);
    }),
  }),
  dashboard: router({
    mine: publicProcedure.query(async ({ ctx }) => {
      const student = await requireStudent(ctx.req);
      return getDashboard(student.id);
    }),
  }),
  learning: router({
    updateProgress: publicProcedure.input(z.object({ resourceId: z.number().int().positive(), progressPercent: z.number().int().min(0).max(100), lastPage: z.number().int().min(1).max(100000) })).mutation(async ({ ctx, input }) => {
      const student = await requireStudent(ctx.req);
      if (!await getResourceById(input.resourceId, student.id)) throw new TRPCError({ code: "NOT_FOUND", message: "That resource is no longer available." });
      await upsertProgress(input.resourceId, student.id, input.progressPercent, input.lastPage);
      return { success: true } as const;
    }),
    updateProgressByUrl: publicProcedure.input(z.object({ storageUrl: z.string().url().max(1024), progressPercent: z.number().int().min(0).max(100), lastPage: z.number().int().min(1).max(100000) })).mutation(async ({ ctx, input }) => {
      const student = await requireStudent(ctx.req);
      const resource = await getResourceByStorageUrl(input.storageUrl, student.id);
      if (!resource) throw new TRPCError({ code: "NOT_FOUND", message: "That resource is no longer available." });
      await upsertProgress(resource.id, student.id, input.progressPercent, input.lastPage);
      return { success: true } as const;
    }),
    generateQuiz: publicProcedure.input(z.object({ resourceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const student = await requireStudent(ctx.req);
      const resource = await getResourceById(input.resourceId, student.id);
      if (!resource) throw new TRPCError({ code: "NOT_FOUND", message: "That resource is no longer available." });
      if (!(resource.mimeType === "application/pdf" || resource.mimeType.startsWith("image/"))) throw new TRPCError({ code: "BAD_REQUEST", message: "AI quizzes are available for PDF and image resources only." });
      const extractedText = await extractResourceText(resource);
      if (extractedText.length < 120) throw new TRPCError({ code: "BAD_REQUEST", message: "Kuppi could not extract enough readable study text from this resource to make a reliable quiz." });
      const result = await generateOpenRouterMcq(`Resource title: ${resource.title}\nSubject: ${resource.subject}\nStudy level: ${resource.studyLevel}\nExtracted resource text: ${extractedText}\nCreate MCQs only from this supplied context.`);
      const quiz = await createQuiz(resource.id, student.id, JSON.stringify(result.questions), result.questions.length);
      return { id: quiz?.id, questions: result.questions, extractedChars: extractedText.length };
    }),
    generateQuizByUrl: publicProcedure.input(z.object({ storageUrl: z.string().url().max(1024) })).mutation(async ({ ctx, input }) => {
      const student = await requireStudent(ctx.req);
      const resource = await getResourceByStorageUrl(input.storageUrl, student.id);
      if (!resource) throw new TRPCError({ code: "NOT_FOUND", message: "That resource is no longer available." });
      if (!(resource.mimeType === "application/pdf" || resource.mimeType.startsWith("image/"))) throw new TRPCError({ code: "BAD_REQUEST", message: "AI quizzes are available for PDF and image resources only." });
      const extractedText = await extractResourceText(resource);
      if (extractedText.length < 120) throw new TRPCError({ code: "BAD_REQUEST", message: "Kuppi could not extract enough readable study text from this resource to make a reliable quiz." });
      const result = await generateOpenRouterMcq(`Resource title: ${resource.title}\nSubject: ${resource.subject}\nStudy level: ${resource.studyLevel}\nExtracted resource text: ${extractedText}\nCreate MCQs only from this supplied context.`);
      const quiz = await createQuiz(resource.id, student.id, JSON.stringify(result.questions), result.questions.length);
      return { id: quiz?.id, questions: result.questions, extractedChars: extractedText.length };
    }),
    submitQuiz: publicProcedure.input(z.object({ quizId: z.number().int().positive(), answers: z.array(z.number().int().min(0).max(3)).min(1), correctIndexes: z.array(z.number().int().min(0).max(3)).min(1) })).mutation(async ({ ctx, input }) => {
      const student = await requireStudent(ctx.req);
      const total = Math.min(input.answers.length, input.correctIndexes.length);
      const score = input.answers.slice(0, total).filter((answer, index) => answer === input.correctIndexes[index]).length;
      await recordQuizAttempt(input.quizId, student.id, JSON.stringify(input.answers.slice(0, total)), score, total);
      return { score, total };
    }),
  }),
  moderation: router({
    report: publicProcedure.input(z.object({ targetType: z.enum(["resource", "comment"]), targetId: z.number().int().positive(), reason: z.string().trim().min(3).max(120), details: z.string().trim().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      const student = await requireStudent(ctx.req);
      await createContentReport({ reporterId: student.id, ...input });
      return { success: true } as const;
    }),
    list: publicProcedure.query(async ({ ctx }) => {
      await requireAdmin(ctx.req);
      return listModerationReports();
    }),
    resolve: publicProcedure.input(z.object({ reportId: z.number().int().positive(), action: z.enum(["dismiss", "hide", "remove"]) })).mutation(async ({ ctx, input }) => {
      const student = await requireAdmin(ctx.req);
      await resolveModerationReport({ reportId: input.reportId, reviewerId: student.id, action: input.action });
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
