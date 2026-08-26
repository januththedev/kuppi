// Shared service layer behind the public read REST (/api/v1/*) and the
// remote MCP server (/api/mcp). Everything here is token-efficiency-first:
// listings stay compact (ids + tags + snippets, never document bodies) and
// full text is served only through the paginated content reader.

import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { resources } from "../drizzle/schema";
import { listResources, getResourceById, createResource } from "./kuppiDb";
import { storagePut } from "./storage";
import { MAX_BASE64_LENGTH, MAX_UPLOAD_BYTES, safeStorageName, validateResourceUpload } from "./resourceSafety";
import { ensureExtractedText, tagResourceSafe, trendingTags } from "./autoTagger";
import type { StudentUser } from "../drizzle/schema";

export const DEFAULT_SNIPPET_CHARS = 200;
export const DEFAULT_CONTENT_CHUNK = 20_000;
const MAX_CONTENT_CHUNK = 40_000;
export const MAX_SEARCH_LIMIT = 50;

/** Public permalink for a note. */
export function notePermalink(id: number): string {
  return `/r/${id}`;
}

function buildSnippet(description: string, extractedText?: string | null): string {
  const base = description.trim();
  if (base) return base.slice(0, DEFAULT_SNIPPET_CHARS);
  if (extractedText?.trim()) return extractedText.replace(/\s+/g, " ").trim().slice(0, DEFAULT_SNIPPET_CHARS);
  return "";
}

export type CompactNote = {
  id: number;
  title: string;
  url: string;
  downloadUrl: string;
  subject: string;
  studyLevel: string;
  stream: string | null;
  examRelevance: string | null;
  mimeType: string;
  fileSize: number;
  originalFileName: string;
  createdAt: Date;
  author: { fullName: string; username: string };
  likeCount: number;
  saveCount: number;
  commentCount: number;
  tags: string[];
  snippet: string;
};

type DecoratedResource = Awaited<ReturnType<typeof getResourceById>>;

export function toCompactNote(resource: NonNullable<DecoratedResource>): CompactNote {
  return {
    id: resource.id,
    title: resource.title,
    url: notePermalink(resource.id),
    downloadUrl: `/f/${resource.id}`,
    subject: resource.subject,
    studyLevel: resource.studyLevel,
    stream: resource.stream,
    examRelevance: resource.examRelevance,
    mimeType: resource.mimeType,
    fileSize: resource.fileSize,
    originalFileName: resource.originalFileName,
    createdAt: resource.createdAt,
    author: resource.author,
    likeCount: resource.likeCount,
    saveCount: resource.saveCount,
    commentCount: resource.commentCount,
    tags: resource.tags ?? [],
    snippet: buildSnippet(resource.description),
  };
}

/**
 * Tag/keyword search over published notes. Results are compact rows plus
 * relatedTags — the most frequent co-occurring tags — so an AI can hop topics
 * without reading a single document.
 */
export async function searchNotes(input: { query?: string; tags?: string[]; subject?: string; studyLevel?: string; limit?: number }): Promise<{ results: CompactNote[]; relatedTags: string[] }> {
  const limit = Math.min(Math.max(input.limit ?? 12, 1), MAX_SEARCH_LIMIT);
  // listResources handles tag resolution, LIKE search, published-only.
  const decorated = await listResources({
    query: input.query,
    subject: input.subject,
    studyLevel: input.studyLevel,
    tags: input.tags,
  });
  const results = decorated.slice(0, limit).map(toCompactNote);
  const requested = new Set((input.tags ?? []).map((tag) => tag.toLowerCase()));
  const frequency = new Map<string, number>();
  for (const note of decorated) {
    for (const tag of note.tags ?? []) {
      if (requested.has(tag)) continue;
      frequency.set(tag, (frequency.get(tag) ?? 0) + 1);
    }
  }
  const relatedTags = Array.from(frequency.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([tag]) => tag);
  return { results, relatedTags };
}

export async function popularTags(options: { limit?: number; prefix?: string } = {}) {
  return trendingTags(options);
}

async function rawPublishedResource(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select().from(resources).where(and(eq(resources.id, id), eq(resources.moderationStatus, "published"))).limit(1);
  return rows[0] ?? null;
}

async function tagsForResource(id: number): Promise<string[]> {
  const decorated = await getResourceById(id);
  return decorated?.tags ?? [];
}

export async function noteMeta(id: number): Promise<(Omit<CompactNote, "snippet" | "author" | "likeCount" | "saveCount" | "commentCount"> & { textCached: boolean }) | null> {
  const row = await rawPublishedResource(id);
  if (!row) return null;
  const tags = await tagsForResource(id);
  // Storage internals stay server-side — visitors and AI clients only ever
  // see the /r/ permalink and the /f/ stream link.
  const { extractedText: _text, extractedAt: _at, storageKey: _key, storageUrl: _url, authorId: _authorId, ...publicFields } = row;
  return {
    id: row.id,
    title: row.title,
    url: notePermalink(row.id),
    downloadUrl: `/f/${row.id}`,
    subject: row.subject,
    studyLevel: row.studyLevel,
    stream: row.stream,
    examRelevance: row.examRelevance,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    originalFileName: row.originalFileName,
    createdAt: row.createdAt,
    tags,
    textCached: Boolean(row.extractedText?.trim()),
  };
}

export class NoteContentError extends Error {
  constructor(readonly code: "not_found" | "unsupported", message: string, readonly downloadUrl?: string) {
    super(message);
  }
}

/**
 * Paginated plain-text view of a note. First call extracts + caches the text
 * (PDF parse / OCR / direct decode); later calls are instant column reads.
 */
export async function noteContent(id: number, offset = 0, length = DEFAULT_CONTENT_CHUNK) {
  const row = await rawPublishedResource(id);
  if (!row) throw new NoteContentError("not_found", "That resource is no longer available.");
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLength = Math.min(Math.max(Math.floor(length) || DEFAULT_CONTENT_CHUNK, 200), MAX_CONTENT_CHUNK);
  const text = await ensureExtractedText(row);
  const tags = await tagsForResource(id);
  const totalChars = text.length;
  if (!totalChars) {
    throw new NoteContentError(
      "unsupported",
      `Kuppi could not extract readable text from this ${row.mimeType} file.`,
      `/f/${id}`,
    );
  }
  return {
    id,
    title: row.title,
    url: notePermalink(id),
    downloadUrl: `/f/${id}`,
    mimeType: row.mimeType,
    tags,
    totalChars,
    offset: safeOffset,
    length: Math.min(safeLength, Math.max(totalChars - safeOffset, 0)),
    truncated: safeOffset + safeLength < totalChars,
    text: text.slice(safeOffset, safeOffset + safeLength),
  };
}

export const MCP_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export type UploadNoteInput = {
  title: string;
  description?: string;
  subject: string;
  studyLevel: string;
  stream?: string;
  examRelevance?: string;
  filename: string;
  mimeType?: string;
  contentBase64: string;
};

/**
 * Headless upload used by the MCP upload tool. Login is enforced by the
 * caller (Bearer session JWT); the bytes ride inline as base64 so a single
 * tool call publishes a fully tagged note.
 */
export async function uploadNote(student: StudentUser, input: UploadNoteInput) {
  const title = String(input.title ?? "").trim();
  const description = String(input.description ?? "").trim();
  const subject = String(input.subject ?? "").trim();
  const studyLevel = String(input.studyLevel ?? "").trim();
  const filename = String(input.filename ?? "").trim();
  if (title.length < 3 || title.length > 180) throw new Error("Title must be 3-180 characters.");
  if (subject.length < 2 || studyLevel.length < 2) throw new Error("Subject and study level are required (at least 2 characters).");
  if (!filename || filename.length > 255 || /[\\/]/.test(filename)) throw new Error("A plain file name is required.");
  const buffer = Buffer.from(String(input.contentBase64 ?? ""), "base64");
  const validationError = validateResourceUpload({ originalFileName: filename, base64Length: input.contentBase64.length, byteLength: buffer.length });
  if (validationError && buffer.length > MAX_UPLOAD_BYTES) throw new Error(validationError);
  if (!buffer.length) throw new Error("The uploaded content is empty.");
  if (buffer.length > MCP_UPLOAD_MAX_BYTES) {
    throw new Error(`MCP uploads accept up to ${Math.round(MCP_UPLOAD_MAX_BYTES / 1024 / 1024)} MB inline. For larger files use the terminal uploader or the website.`);
  }
  if (input.contentBase64.length > MAX_BASE64_LENGTH) throw new Error("Encoded content exceeds the maximum request size.");
  const contentType = String(input.mimeType ?? "").trim() || guessMimeType(filename);
  const stored = await storagePut(`kuppi/${student.id}/resources/${safeStorageName(filename)}`, buffer, contentType);
  const created = await createResource({
    authorId: student.id,
    title,
    description: description.slice(0, 5000),
    subject: subject.slice(0, 80),
    studyLevel: studyLevel.slice(0, 40),
    stream: String(input.stream ?? "").trim().slice(0, 80) || null,
    examRelevance: String(input.examRelevance ?? "").trim().slice(0, 100) || null,
    originalFileName: filename,
    storageKey: stored.key,
    storageUrl: stored.url,
    mimeType: contentType.slice(0, 160),
    fileSize: buffer.length,
  });
  const tags = await tagResourceSafe({
    resourceId: created.resource.id,
    title,
    description,
    subject,
    studyLevel,
    mimeType: contentType,
    storageKey: stored.key,
    buffer,
  });
  return { id: created.resource.id, url: notePermalink(created.resource.id), downloadUrl: `/f/${created.resource.id}`, tags };
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  html: "text/html",
  htm: "text/html",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
};

function guessMimeType(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}
