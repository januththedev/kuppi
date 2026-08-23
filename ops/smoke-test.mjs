// Smoke-test a Kuppi S3/MinIO endpoint: write → public read → presigned read
// → head → delete. Run from the repo root (uses its @aws-sdk dependencies):
//
//   node ops/smoke-test.mjs                      # env: S3_ENDPOINT, S3_BUCKET,
//                                                # S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
//   node ops/smoke-test.mjs ./kuppi-s3-credentials.env   # file with S3_* lines
//
// Exit code 0 = endpoint is production-ready for Kuppi.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

for (const path of process.argv.slice(2)) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(S3_[A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

const cfg = {
  endpoint: process.env.S3_ENDPOINT,
  bucket: process.env.S3_BUCKET || "kuppi-uploads",
  region: process.env.S3_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
};
if (!cfg.endpoint || !cfg.credentials.accessKeyId || !cfg.credentials.secretAccessKey) {
  console.error("Missing S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY");
  process.exit(2);
}
console.log(`Smoke-testing ${cfg.endpoint} (bucket ${cfg.bucket})`);

const client = new S3Client({ ...cfg, forcePathStyle: true });
const key = `smoke/${randomUUID()}.txt`;
const payload = Buffer.from(`Kuppi smoke test ${new Date().toISOString()}\n`);
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}: ${error?.message ?? error}`);
  }
}

await check("PutObject", async () => {
  await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: new Uint8Array(payload), ContentType: "text/plain" }));
});

const publicUrl = `${cfg.endpoint.replace(/\/+$/, "")}/${cfg.bucket}/${key}`;
await check("public GET (browser-facing URL)", async () => {
  const res = await fetch(publicUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${publicUrl}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (!body.equals(payload)) throw new Error("public bytes differ");
});

await check("presigned GET (server-side extraction path)", async () => {
  const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), { expiresIn: 120 });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!Buffer.from(await res.arrayBuffer()).equals(payload)) throw new Error("signed bytes differ");
});

await check("HeadObject size", async () => {
  const head = await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
  if (head.ContentLength !== payload.length) throw new Error(`${head.ContentLength} != ${payload.length}`);
});

await check("DeleteObject + confirm gone", async () => {
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
  const res = await fetch(publicUrl);
  if (res.ok) throw new Error("object still publicly readable after delete");
});

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nEndpoint is ready for Kuppi.");
