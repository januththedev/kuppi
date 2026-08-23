// One-shot migration: copy every Vercel Blob object into MinIO under the SAME
// object key, then repoint resources.storage_url. Idempotent — objects already
// present with the right size are skipped, so re-running after an interruption
// is safe. Vercel Blob originals are never deleted (rollback = unset S3 env).
//
// Run from the repo root with DB + S3 access:
//   node ops/migrate-vercel-blob.mjs --dry-run
//   node ops/migrate-vercel-blob.mjs --limit 10
//   DATABASE_URL=... S3_ENDPOINT=https://... S3_ACCESS_KEY_ID=kuppi-app \
//     S3_SECRET_ACCESS_KEY=... node ops/migrate-vercel-blob.mjs
import "dotenv/config";
import mysql from "mysql2/promise";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const concIdx = args.indexOf("--concurrency");
const CONCURRENCY = concIdx >= 0 ? Math.max(1, Number(args[concIdx + 1])) : 3;

const required = ["DATABASE_URL", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing ${name} (dotenv loads .env automatically when run via pnpm).`);
    process.exit(2);
  }
}

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});
const bucket = process.env.S3_BUCKET || "kuppi-uploads";
const publicBase = `${process.env.S3_ENDPOINT.replace(/\/+$/, "")}/${bucket}`;

// Match server/db.ts: mysql2 ignores ssl-mode URI params, so strip it and
// enable TLS explicitly, matching the app's own connection behavior.
const needsSsl = /ssl-mode=REQUIRED/.test(process.env.DATABASE_URL);
const pool = mysql.createPool(
  process.env.DATABASE_URL.replace(/\?ssl-mode=[^&]*$/, "").replace(/&(ssl-mode=[^&]*)$/, ""),
  { ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}), namedPlaceholders: true },
);
const [rows] = await pool.query(
  // Column names are camelCase literals in drizzle/schema.ts.
  "SELECT id, storageKey AS storage_key, storageUrl AS storage_url, mimeType AS mime_type, fileSize AS file_size FROM resources WHERE storageUrl LIKE '%vercel-storage.com' ORDER BY id ASC",
);
console.log(`${rows.length} Vercel Blob row(s) found${DRY_RUN ? " (dry run)" : ""}`);

let migrated = 0, skipped = 0, failed = 0;
const queue = rows.slice(0, LIMIT);

async function migrateRow(row) {
  const key = row.storage_key;
  try {
    // Already migrated? Same key scheme means a size match proves it.
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      if (row.file_size == null || head.ContentLength === row.file_size) {
        skipped += 1;
        return;
      }
    } catch { /* not there yet — proceed */ }

    const res = await fetch(row.storage_url);
    if (!res.ok) throw new Error(`Blob fetch HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (DRY_RUN) {
      console.log(`[dry-run] would copy ${key} (${body.length} bytes)`);
    } else {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: new Uint8Array(body),
        ContentType: row.mime_type || "application/octet-stream",
      }));
      const newUrl = `${publicBase}/${key.split("/").map(encodeURIComponent).join("/")}`;
      await pool.query("UPDATE resources SET storageUrl = ? WHERE id = ?", [newUrl, row.id]);
    }
    migrated += 1;
  } catch (error) {
    failed += 1;
    console.error(`ERROR id=${row.id} key=${key}: ${error?.message ?? error}`);
  }
}

const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) await migrateRow(queue.shift());
});
await Promise.all(workers);
await pool.end();

if (DRY_RUN) console.log(`\nDry run complete: ${Math.min(rows.length, LIMIT)} candidate(s).`);
else console.log(`\nMigrated ${migrated}, already-present ${skipped}, failed ${failed}.`);
if (failed) process.exit(1);
