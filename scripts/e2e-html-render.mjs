// Browser-level proof that (a) uploaded AND pasted HTML render inside Kuppi's
// sandboxed preview, and (b) every resource has working unique links:
//   /r/{id}  — rich landing page with the rendered preview
//   /f/{id}  — 302 short link straight to the file
// Boots the production server against local MinIO, publishes one pasted page
// and one .html file upload, then drives headless Chrome over both.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import puppeteer from "puppeteer-core";

const PORT = Number(process.env.E2E_PORT || 3213);
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

const PASTED_HTML = `<!doctype html><html><head><title>Kuppi pasted page</title><style>h1{color:#5b35e8}</style></head><body><h1>pasted-render-check</h1><p>Styles and content must appear.</p></body></html>`;
const FILE_HTML = `<!doctype html><html><body><h1>uploaded-file-render-check</h1></body></html>`;

const server = spawn(process.execPath, ["dist/index.js"], {
  stdio: ["ignore", "ignore", "pipe"],
  env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), ...S3 },
});
server.stderr.on("data", () => {});

try {
  await waitForServer();
  ok("server healthy", true);

  const username = `html_${randomUUID().slice(0, 8)}`;
  const password = "html-password-123";
  const reg = await fetch(`${BASE}/api/trpc/account.register?batch=1`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 0: { json: { fullName: "HTML Tester", contactNumber: "+94770000003", username, password, confirmPassword: password } } }),
  });
  const sessionCookie = (reg.headers.get("set-cookie") || "").split(";")[0];
  const login = await fetch(`${BASE}/api/cli/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).then((r) => r.json());
  const token = login.token;

  // Path A — pasted HTML goes through the base64 tRPC create flow.
  let binary = "";
  new Uint8Array(new TextEncoder().encode(PASTED_HTML)).forEach((b) => { binary += String.fromCharCode(b); });
  const createRes = await fetch(`${BASE}/api/trpc/resource.create?batch=1`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: sessionCookie },
    body: JSON.stringify({ 0: { json: { title: "Pasted HTML proof", description: "Created by scripts/e2e-html-render.mjs.", subject: "Combined Maths", studyLevel: "A/L", originalFileName: `pasted-${Date.now()}.html`, mimeType: "text/html", dataBase64: btoa(binary) } } }),
  }).then((r) => r.json());
  const firstResult = createRes[0]?.result ?? {};
  const pastedResource = firstResult.data?.json ?? firstResult.data;
  ok("pasted HTML published with text/html", pastedResource?.mimeType === "text/html", JSON.stringify(createRes[0]).slice(0, 300));

  // Path B — .html file upload through the presigned CLI flow.
  const qs = new URLSearchParams({ name: `proof-${randomUUID().slice(0, 6)}.html`, type: "text/html", size: String(Buffer.byteLength(FILE_HTML)) });
  const presign = await fetch(`${BASE}/api/cli/presign?${qs}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": "text/html" }, body: FILE_HTML });
  const metaRes = await fetch(`${BASE}/api/cli/meta`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Uploaded HTML proof", description: "Presigned path.", subject: "Physics", studyLevel: "A/L", originalFileName: "proof.html", mimeType: "text/html", storageUrl: presign.publicUrl, fileSize: Buffer.byteLength(FILE_HTML) }),
  }).then((r) => r.json());
  const fileResource = metaRes.resource;
  ok("uploaded HTML published", Boolean(fileResource?.storageUrl), JSON.stringify(metaRes).slice(0, 150));

  // /f/{id} short link redirects to the object URL.
  const fRes = await fetch(`${BASE}/f/${fileResource.id}`, { redirect: "manual" });
  ok("/f/{id} 302s to the stored file", fRes.status === 302 && (fRes.headers.get("location") ?? "").startsWith(S3.S3_ENDPOINT), `${fRes.status} ${fRes.headers.get("location")}`);
  const fMissing = await fetch(`${BASE}/f/99999999`, { redirect: "manual" });
  ok("/f/{id} 404s for unknown ids", fMissing.status === 404);

  // Real browser: both permalink pages render their HTML inside the sandbox.
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    for (const [resource, marker, label] of [
      [pastedResource, "pasted-render-check", "pasted"],
      [fileResource, "uploaded-file-render-check", "file-uploaded"],
    ]) {
      const page = await browser.newPage();
      await page.goto(`${BASE}/r/${resource.id}`, { waitUntil: "networkidle2", timeout: 45000 });

      const docTitle = await page.title();
      ok(`/r/${resource.id} sets SEO title (${label})`, docTitle.includes(resource.title), docTitle);

      await page.waitForSelector(".document-preview iframe", { timeout: 20000 });
      const frameHandle = page.frames().find((f) => f.url().startsWith(S3.S3_ENDPOINT));
      ok(`/r/${resource.id} embeds the stored document (${label})`, Boolean(frameHandle), page.frames().map((f) => f.url()).join(" | ").slice(0, 200));

      const innerH1 = await frameHandle?.$eval("h1", (el) => el.textContent).catch(() => null);
      ok(`HTML renders inside sandbox (${label})`, innerH1 === marker, `got ${JSON.stringify(innerH1)}`);

      const copyLinkPresent = await page.$eval("body", (el) => el.innerText.includes("Copy link")).catch(() => false);
      ok(`share button present (${label})`, copyLinkPresent);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\nAll ${passed} checks passed.`);
} finally {
  server.kill("SIGTERM");
}
