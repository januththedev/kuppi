// Kuppi auto-hashtag engine.
//
// Hashtags are generated from note content — users never type them (like a
// feed that tags itself). Pipeline per upload:
//   1. Source text: title/description always; txt/md/html straight from the
//      bytes; PDF via pdf-parse; image via tesseract OCR. The extracted text
//      is cached in resources.extractedText so it is only ever produced once.
//   2. Tags: OpenRouter LLM first (3-8 concise lowercase hashtag slugs),
//      falling back to a deterministic stopword-filtered term-frequency pass
//      when no API key is configured or the call fails.
// Tagging is strictly best-effort: callers wrap it in tagResourceSafe and an
// LLM/extraction failure must never fail the underlying upload.

import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import { resourceTags, resources, type Resource } from "../drizzle/schema";
import { storageGetSignedUrl, storageReadBuffer, useLocalStorageSync } from "./storage";

export const MAX_TAGS_PER_RESOURCE = 8;
const MAX_TAG_LENGTH = 32;
/** OCR/parse budget: skip extraction for binaries larger than this. */
export const MAX_EXTRACTION_BYTES = 12 * 1024 * 1024;
/** Characters of source text handed to the LLM tag prompt. */
const TAG_SOURCE_CHARS = 6000;

const STOPWORDS = new Set(
  ("a about above after again against all am an and any are aren as at be because been before being below between both but by can cannot could couldn did didn do does doesn doing don down during each few for from further had hadn has hasn have haven having he her here hers herself him himself his how i if in into is isn it its itself just let me more most mustn my myself no nor not of off on once only or other ought our ours ourselves out over own same shan she should shouldn so some such than that the their theirs them themselves then there these they this those through to too under until up very was wasn we were weren what when where which while who whom why with won would wouldn you your yours yourself yourselves also may many use using used one two get got make made like will shall since upon etc via per thing things stuff page pages notes note file files chapter unit lesson part section subject paper papers grade levels level new old good best top guide guides").split(" "),
);

/** Lowercase slug: keep letters/digits, collapse separators, trim dashes. */
export function slugifyTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TAG_LENGTH);
}

/** Normalize arbitrary candidate tags into the canonical stored form. */
export function normalizeTags(candidates: ReadonlyArray<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    // Accept "#thermal-physics" and bare slugs alike; spaces become dashes.
    const slug = slugifyTag(String(candidate).trim().replace(/^#+/, ""));
    if (!slug || slug === "-" || seen.has(slug)) continue;
    seen.add(slug);
    tags.push(slug);
    if (tags.length >= MAX_TAGS_PER_RESOURCE) break;
  }
  return tags;
}

/**
 * Deterministic fallback tagger: stopword-filtered term frequency over the
 * supplied text plus metadata words. Purely local — no network, stable order.
 */
export function heuristicTags(input: { text: string; title?: string; description?: string; subject?: string }): string[] {
  const corpus = [input.title ?? "", input.subject ?? "", input.description ?? "", input.text].join(" ").toLowerCase();
  const counts = new Map<string, number>();
  for (const word of corpus.match(/[a-z][a-z'-]{2,}/g) ?? []) {
    const token = word.replace(/['-]/g, "");
    if (token.length < 4 || STOPWORDS.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_TAGS_PER_RESOURCE).map(([token]) => token);
  return normalizeTags(ranked);
}

/** Pull the JSON object out of an LLM reply that may carry prose or fences. */
export function parseTagReply(content: string): string[] {
  if (!content) return [];
  const fenced = content.match(/\{[\s\S]*\}/)?.[0];
  const candidate = fenced ?? content;
  try {
    const parsed = JSON.parse(candidate) as { tags?: unknown };
    if (Array.isArray(parsed.tags)) return parsed.tags.filter((tag): tag is string => typeof tag === "string");
  } catch {
    // Fall through to hashtag scraping below.
  }
  return content.match(/#[a-zA-Z0-9-_]{2,}/g) ?? [];
}

function kuppiTagSystemPrompt() {
  return `You are Kuppi's study-notes tagger. From the supplied Sri Lankan student resource, choose 3-${MAX_TAGS_PER_RESOURCE} concise topical hashtags that another student would search for. Return valid JSON only, matching exactly {"tags":["example-tag"]}. Rules: lowercase kebab-case slugs (letters, numbers, dashes), no spaces, no "#" prefix inside the JSON, each under ${MAX_TAG_LENGTH} characters, grounded in the supplied material only. Include subject/topic terms (e.g. "thermal-physics", "integration", "ol-english") and curriculum shorthand where obvious (e.g. "al", "ol"). Never invent topics absent from the context.`;
}

async function generateTagsWithLlm(source: { title: string; description: string; subject: string; studyLevel: string; text: string }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const userContent = `Title: ${source.title}\nSubject: ${source.subject}\nStudy level: ${source.studyLevel}\nDescription: ${source.description}\nResource text:\n${source.text.slice(0, TAG_SOURCE_CHARS)}`;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openrouter/free",
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        { role: "system", content: kuppiTagSystemPrompt() },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!response.ok) return null;
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return parseTagReply(json.choices?.[0]?.message?.content ?? "");
}

/** Direct-read text formats need no parser — just decode the bytes. */
export function directTextMime(mimeType: string): boolean {
  return /^(text\/|application\/json|application\/xml)/i.test(mimeType);
}

async function fetchResourceBuffer(storageKey: string): Promise<Buffer> {
  if (useLocalStorageSync()) return storageReadBuffer(storageKey);
  const signedUrl = await storageGetSignedUrl(storageKey);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error("Kuppi could not read this uploaded resource.");
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Extract plain text from any supported resource bytes. Unlike the quiz
 * extractor this also handles direct-text formats and returns "" instead of
 * throwing for unsupported types.
 */
export async function extractNoteText(resource: { storageKey: string; mimeType: string }, buffer?: Buffer): Promise<string> {
  try {
    const bytes = buffer ?? await fetchResourceBuffer(resource.storageKey);
    if (!bytes.length || bytes.length > MAX_EXTRACTION_BYTES) return "";
    if (directTextMime(resource.mimeType)) return bytes.toString("utf8");
    if (resource.mimeType === "application/pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: bytes });
      const result = await parser.getText();
      await parser.destroy();
      return result.text;
    }
    if (resource.mimeType.startsWith("image/")) {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      const result = await worker.recognize(bytes);
      await worker.terminate();
      return result.data.text;
    }
    return "";
  } catch (error) {
    console.error("[AutoTagger] text extraction failed:", error instanceof Error ? error.message : error);
    return "";
  }
}

/** Cached plain text for a resource row; extracts + persists on first call. */
export async function ensureExtractedText(resource: Pick<Resource, "id" | "storageKey" | "mimeType" | "extractedText">, buffer?: Buffer): Promise<string> {
  if (typeof resource.extractedText === "string" && resource.extractedText.length > 0) return resource.extractedText;
  const text = await extractNoteText(resource, buffer);
  if (text) {
    const db = await getDb();
    if (db) {
      try {
        await db.update(resources).set({ extractedText: text.slice(0, 4_000_000), extractedAt: new Date() }).where(eq(resources.id, resource.id));
      } catch (error) {
        console.error("[AutoTagger] cache write failed:", error instanceof Error ? error.message : error);
      }
    }
  }
  return text;
}

function replaceTags(resourceId: number, tags: string[]) {
  return getDb().then(async (db) => {
    if (!db) return;
    if (tags.length) {
      await db.delete(resourceTags).where(eq(resourceTags.resourceId, resourceId));
      await db.insert(resourceTags).values(tags.map((tag) => ({ resourceId, tag })));
    }
  });
}

export async function listTagsForResourceIds(ids: number[]) {
  if (!ids.length) return [] as { resourceId: number; tag: string }[];
  const db = await getDb();
  if (!db) return [];
  return db.select({ resourceId: resourceTags.resourceId, tag: resourceTags.tag }).from(resourceTags).where(inArray(resourceTags.resourceId, ids));
}

/**
 * Generate + store hashtags for a freshly created resource. Best-effort:
 * every failure path resolves to whatever tags could be derived (possibly
 * none) and never throws.
 */
export async function tagResourceSafe(input: {
  resourceId: number;
  title: string;
  description: string;
  subject: string;
  studyLevel: string;
  mimeType: string;
  storageKey: string;
  /** Bytes already in hand (base64 upload paths) — skips a storage read. */
  buffer?: Buffer;
}): Promise<string[]> {
  try {
    const text = await ensureExtractedText({ id: input.resourceId, storageKey: input.storageKey, mimeType: input.mimeType, extractedText: null }, input.buffer);
    let candidates: string[] | null = null;
    try {
      const llm = await generateTagsWithLlm({ title: input.title, description: input.description, subject: input.subject, studyLevel: input.studyLevel, text });
      if (llm && llm.length) candidates = llm;
    } catch (error) {
      console.error("[AutoTagger] LLM tagging failed:", error instanceof Error ? error.message : error);
    }
    const tags = normalizeTags([...(candidates ?? []), ...heuristicTags({ text, title: input.title, description: input.description, subject: input.subject })]);
    await replaceTags(input.resourceId, tags);
    return tags;
  } catch (error) {
    console.error("[AutoTagger] tagging skipped:", error instanceof Error ? error.message : error);
    return [];
  }
}

/** Popular tags across published resources, optionally prefix-filtered. */
export async function trendingTags(options: { limit?: number; prefix?: string } = {}) {
  const db = await getDb();
  if (!db) return [] as { tag: string; count: number }[];
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const rows = await db
    .select({ tag: resourceTags.tag, count: sql<number>`count(*)` })
    .from(resourceTags)
    .innerJoin(resources, eq(resourceTags.resourceId, resources.id))
    .where(sql`${resources.moderationStatus} = 'published'${options.prefix ? sql` and ${resourceTags.tag} like ${`${options.prefix.toLowerCase()}%`}` : sql``}`)
    .groupBy(resourceTags.tag)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
  return rows.map((row) => ({ tag: row.tag, count: Number(row.count) }));
}
