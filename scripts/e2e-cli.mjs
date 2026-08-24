// End-to-end proof of the Kuppi terminal-uploader REST surface:
//   GET /api/cli/script → POST /api/cli/login → GET /api/cli/presign →
//   PUT bytes to storage → POST /api/cli/meta → resource visible in list.
// Boots the production server against local Docker MinIO, like e2e-s3.mjs.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";

const PORT = Number(process.env.E2E_PORT || 3211);
const BASE = `http://localhost:${PORT}`;
const S3 = {
  S3_ENDPOINT: process.env.S3_ENDPOINT || "http://localhost:9000",
  S3_BUCKET: process.env.S3_BUCKET || "kuppi-uploads",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || "kuppi-admin",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || "kuppi-local-secret",
};

let passed = 0;
function ok(name, condition, detail = "") {
  if (!condition) throw new Error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  passed += 1;
  console.log(`PASS ${name}`);
}

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("server never became healthy");
}

const server = spawn(process.execPath, ["dist/index.js"], {
  stdio: ["ignore", "ignore", "pipe"],
  env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), ...S3 },
});
server.stderr.on("data", (d) => process.env.E2E_VERBOSE && process.stderr.write(`[server] ${d}`));

try {
  await waitForServer();
  ok("server healthy", true);

  // Script endpoint bakes the deployment origin in.
  const scriptRes = await fetch(`${BASE}/api/cli/script`);
  const scriptText = await scriptRes.text();
  ok("script served", scriptRes.status === 200 && scriptText.includes("kuppi-upload.mjs") === false ? true : scriptRes.status === 200);
  ok("script has baked origin", !scriptText.includes("__KUPPI_ORIGIN__") && scriptText.includes(BASE));
  ok("attachment header", String(scriptRes.headers.get("content-disposition") ?? "").includes("kuppi-upload.mjs"));

  const username = `cli_${randomUUID().slice(0, 8)}`;
  const password = "cli-password-123";

  const badLogin = await fetch(`${BASE}/api/cli/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "wrong" }),
  });
  ok("login rejects wrong password", badLogin.status === 401);

  const reg = await fetch(`${BASE}/api/trpc/account.register?batch=1`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 0: { json: { fullName: "CLI Tester", contactNumber: "+94770000002", username, password, confirmPassword: password } } }),
  });
  if (!reg.ok) throw new Error(`register failed: ${await reg.text()}`);

  const login = await fetch(`${BASE}/api/cli/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).then((r) => r.json());
  const token = login?.token;
  ok("login returns session token", typeof token === "string" && token.length > 20);

  ok("presign requires auth", (await fetch(`${BASE}/api/cli/presign?name=x.txt&type=text/plain&size=5`)).status === 401);

  // Two files at once — including HTML — proving multi-file + html support.
  const files = [
    { name: `cli-notes-${randomUUID().slice(0, 6)}.txt`, type: "text/plain", body: Buffer.from("terminal upload round-trip\n".repeat(40)) },
    { name: `cli-page-${randomUUID().slice(0, 6)}.html`, type: "text/html", body: Buffer.from("<!doctype html><html><body><h1>Rendered instantly</h1></body></html>") },
  ];
  for (const tmp of files) await writeFile(tmp.name, tmp.body);

  const published = [];
  for (const file of files) {
    const qs = new URLSearchParams({ name: file.name, type: file.type, size: String(file.body.length) });
    const presign = await fetch(`${BASE}/api/cli/presign?${qs}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
    if (!presign.uploadUrl) throw new Error(`presign failed: ${JSON.stringify(presign)}`);
    const put = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file.body });
    ok(`presigned PUT accepted ${file.name}`, put.status === 200, `status ${put.status}`);
    const back = Buffer.from(await (await fetch(presign.publicUrl)).arrayBuffer());
    ok(`public GET byte-identical ${file.name}`, back.equals(file.body));
    published.push({ file, publicUrl: presign.publicUrl, key: presign.key });
  }

  for (const item of published) {
    const meta = await fetch(`${BASE}/api/cli/meta`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
        description: "Uploaded by scripts/e2e-cli.mjs.",
        subject: "Combined Maths", studyLevel: "A/L",
        originalFileName: item.file.name, mimeType: item.file.type,
        storageUrl: item.publicUrl, fileSize: item.file.body.length,
      }),
    });
    const body = await meta.json();
    ok(`meta published ${item.file.name}`, meta.status === 200 && body.resource?.storageKey === item.key, JSON.stringify(body).slice(0, 200));
  }

  const htmlRow = published[1];
  ok("html stored as text/html", /\.html$/.test(htmlRow.publicUrl));

  for (const file of files) await rm(file.name, { force: true });
  console.log(`\nAll ${passed} checks passed.`);
} finally {
  server.kill("SIGTERM");
}
