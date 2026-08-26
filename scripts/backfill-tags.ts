// Backfills auto-hashtags (and the extractedText cache) for resources that
// predate server/autoTagger.ts. Idempotent: rows that already carry tags are
// skipped unless --force is passed; safe to interrupt and re-run.
//
// Usage (needs DATABASE_URL in .env or environment; storage creds for reads
// of MinIO objects):
//   corepack pnpm@10.4.1 exec tsx scripts/backfill-tags.ts [--force] [--limit N]
import "dotenv/config";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { resourceTags, resources } from "../drizzle/schema";
import { tagResourceSafe } from "../server/autoTagger";

const force = process.argv.includes("--force");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) || Infinity : Infinity;

const db = await getDb();
if (!db) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const BATCH = 25;
let cursor = 0;
let processed = 0;
let tagged = 0;

for (;;) {
  const conditions = [eq(resources.moderationStatus, "published"), gt(resources.id, cursor)];
  if (!force) {
    conditions.push(sql`not exists (select 1 from ${resourceTags} where ${resourceTags.resourceId} = ${resources.id})`);
  }
  const batch = await db.select().from(resources).where(and(...conditions)).orderBy(resources.id).limit(BATCH);
  if (!batch.length || processed >= limit) break;
  for (const row of batch) {
    cursor = Math.max(cursor, row.id);
    processed += 1;
    if (processed > limit) break;
    const tags = await tagResourceSafe({
      resourceId: row.id,
      title: row.title,
      description: row.description,
      subject: row.subject,
      studyLevel: row.studyLevel,
      mimeType: row.mimeType,
      storageKey: row.storageKey,
    });
    if (tags.length) tagged += 1;
    console.log(`#${row.id} "${row.title.slice(0, 60)}" -> ${tags.length ? tags.map((t) => "#" + t).join(" ") : "(no tags derived)"}`);
  }
}

console.log(`\nDone. Processed ${processed} resource(s); ${tagged} received tags.`);
process.exit(0);
