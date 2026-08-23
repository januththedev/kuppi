// End-to-end proof of the S3/MinIO upload flow against a local MinIO.
//
// Boots the production server (dist/index.js) with S3 env vars pointed at
// Docker MinIO on localhost:9000, then walks the exact path the browser takes:
//
//   register → storage.mode=s3 → resource.uploadUrl (presigned PUT) →
//   XHR-style PUT of bytes → public GET round-trip → resource.createMeta →
//   resource.list shows the row with bucket-stripped storageKey.
//
// Usage:  node scripts/e2e-s3.mjs
// Env:    S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
//         E2E_PORT (default 3210). DATABASE_URL/JWT_SECRET come from .env.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.E2E_PORT || 3210);
const BASE = `http://localhost:${PORT}`;
const S3_ENDPOINT = process.env.S3_ENDPOINT || "http://localhost:9000";
const S3_BUCKET = process.env.S3_BUCKET || "kuppi-uploads";
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || "kuppi-admin";
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || "kuppi-local-secret";

let passed = 0;
function ok(name, condition, detail = "") {
  if (!condition) {
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
    throw new Error(`e2e failed at: ${name}`);
  }
  passed += 1;
  console.log(`PASS ${name}`);
}

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Server did not become healthy in time");
}

async function trpc(name, input, cookie) {
  const res = await fetch(`${BASE}/api/trpc/${name}?batch=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ 0: { json: input } }),
  });
  const setCookie = res.headers.get("set-cookie");
  const bodyText = await res.text();
  let json;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new Error(`${name}: non-JSON response (${res.status}): ${bodyText.slice(0, 300)}`);
  }
  const first = json[0];
  if (!res.ok || first?.error) {
    throw new Error(`${name} failed (${res.status}): ${JSON.stringify(first?.error ?? bodyText.slice(0, 300))}`);
  }
  // superjson envelope; plain values come back as { json: ... }
  return { data: first.result.data.json ?? first.result.data, setCookie };
}

const server = spawn(process.execPath, ["dist/index.js"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    S3_ENDPOINT,
    S3_BUCKET,
    S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY,
  },
});
server.stdout.on("data", (d) => process.env.E2E_VERBOSE && process.stdout.write(`[server] ${d}`));
server.stderr.on("data", (d) => process.stderr.write(`[server:err] ${d}`));

try {
  await waitForServer();
  ok("server healthy", true);

  const username = `e2e_${randomUUID().slice(0, 8)}`;
  const reg = await trpc("account.register", {
    fullName: "E2E Uploader",
    contactNumber: "+94770000001",
    username,
    password: "e2e-password-123",
    confirmPassword: "e2e-password-123",
  });
  const cookie = (reg.setCookie || "").split(";")[0];
  ok("account registered + session cookie", Boolean(cookie), JSON.stringify({ reg: reg.setCookie }));

  const mode = await fetch(
    `${BASE}/api/trpc/storage.mode?batch=1&input=${encodeURIComponent('{"0":{"json":null,"meta":{"values":["undefined"]}}}')}`,
    { headers: { Cookie: cookie } },
  ).then((r) => r.json());
  const modeValue = mode[0]?.result?.data?.json?.mode;
  ok("storage.mode reports s3", modeValue === "s3", `got ${JSON.stringify(modeValue)}`);

  const fileName = `e2e-notes-${randomUUID().slice(0, 8)}.txt`;
  const fileBytes = Buffer.from(`Kuppi MinIO e2e payload ${randomUUID()}\n`.repeat(64));
  const upload = await trpc("resource.uploadUrl", {
    fileName,
    mimeType: "text/plain",
    fileSize: fileBytes.length,
  }, cookie);
  ok("uploadUrl returns s3 driver", upload.data.driver === "s3", JSON.stringify(upload.data).slice(0, 200));
  ok("uploadUrl is a presigned URL for our endpoint", upload.data.uploadUrl.startsWith(`${S3_ENDPOINT}/${S3_BUCKET}/`), upload.data.uploadUrl.slice(0, 120));
  ok("publicUrl is path-style without signing params", upload.data.publicUrl.startsWith(`${S3_ENDPOINT}/${S3_BUCKET}/kuppi/`) && !upload.data.publicUrl.includes("X-Amz"), upload.data.publicUrl);

  const put = await fetch(upload.data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: fileBytes,
  });
  ok("presigned PUT accepted the file", put.status === 200, `status ${put.status}`);

  const fetched = await fetch(upload.data.publicUrl);
  const fetchedBody = Buffer.from(await fetched.arrayBuffer());
  ok("public GET round-trips identical bytes", fetched.status === 200 && fetchedBody.equals(fileBytes), `status ${fetched.status}, ${fetchedBody.length}/${fileBytes.length} bytes`);

  const created = await trpc("resource.createMeta", {
    title: "E2E MinIO verification note",
    description: "Uploaded through the presigned S3 flow by scripts/e2e-s3.mjs.",
    subject: "Combined Maths",
    studyLevel: "A/L",
    originalFileName: fileName,
    mimeType: "text/plain",
    storageUrl: upload.data.publicUrl,
    fileSize: fileBytes.length,
  }, cookie);
  const resource = created.data.resource ?? created.data;
  ok("createMeta strips the bucket from storageKey", resource.storageKey === upload.data.key, `${resource.storageKey} !== ${upload.data.key}`);
  ok("createMeta persists the public URL", resource.storageUrl === upload.data.publicUrl, resource.storageUrl);

  const list = await fetch(`${BASE}/api/trpc/resource.list?batch=1&input=${encodeURIComponent('{"0":{"json":null,"meta":{"values":["undefined"]}}}')}`).then((r) => r.json());
  const items = list[0]?.result?.data?.json ?? [];
  ok("resource.list contains the new resource", Array.isArray(items) && items.some((r) => r.storageKey === upload.data.key), `${Array.isArray(items) ? items.length : "non-array"} rows`);

  console.log(`\nAll ${passed} checks passed.`);
} finally {
  server.kill("SIGTERM");
}
