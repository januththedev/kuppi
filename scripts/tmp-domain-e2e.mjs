const BASE = "https://kuppi.orinai.org";
const { randomUUID } = await import("node:crypto");
import puppeteer from "puppeteer-core";
let passed = 0;
const ok = (n, c, d = "") => { if (!c) throw new Error(`FAIL ${n} ${d}`); passed++; console.log(`PASS ${n}`); };

const username = `brand_${randomUUID().slice(0, 8)}`;
const reg = await fetch(`${BASE}/api/trpc/account.register?batch=1`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ 0: { json: { fullName: "Brand Verifier", contactNumber: "+94770000456", username, password: "brand-pass-123", confirmPassword: "brand-pass-123" } } }),
});
ok("1. signup on brand domain", reg.ok);
const cookie = (reg.headers.get("set-cookie") || "").split(";")[0];
const token = (await fetch(`${BASE}/api/cli/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "brand-pass-123" }) }).then(r => r.json())).token;

const html = `<!doctype html><html><body><h1>branded-domain-proof</h1></body></html>`;
const qs = new URLSearchParams({ name: `brand-${randomUUID().slice(0,6)}.html`, type: "text/html", size: String(Buffer.byteLength(html)) });
const presign = await fetch(`${BASE}/api/cli/presign?${qs}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": "text/html" }, body: html });
const meta = await fetch(`${BASE}/api/cli/meta`, {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ title: "Branded domain verification", description: "kuppi.orinai.org permalink proof v2.", subject: "Combined Maths", studyLevel: "A/L", originalFileName: "brand.html", mimeType: "text/html", storageUrl: presign.publicUrl, fileSize: Buffer.byteLength(html) }),
}).then(r => r.json());
const id = meta.resource?.id;
ok("2. resource published, id=" + id, Boolean(id));

const f = await fetch(`${BASE}/f/${id}`, { redirect: "manual" });
ok("3. kuppi.orinai.org/f/" + id + " redirects to MinIO", f.status === 302);
const page = await fetch(`${BASE}/${id}`);
ok("4. bare kuppi.orinai.org/" + id + " serves app shell", page.status === 200);

const canonical = (await (await fetch(`${BASE}/`)).text()).match(/canonical" href="([^"]+)"/)?.[1];
ok("5. canonical is brand domain", canonical === `${BASE}/`, String(canonical));

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const p = await browser.newPage();
  await p.goto(`${BASE}/${id}`, { waitUntil: "networkidle2", timeout: 45000 });
  ok("6. title shows resource name", (await p.title()).includes("Branded domain verification"), await p.title());
  await p.waitForSelector(".document-preview iframe", { timeout: 20000 });
  const frame = p.frames().find(fr => fr.url().startsWith("https://80-225-242-175.sslip.io"));
  const h1 = await frame?.$eval("h1", el => el.textContent).catch(() => null);
  ok("7. HTML renders inside sandbox via /" + id, h1 === "branded-domain-proof", JSON.stringify(h1));
  await p.close();
} finally { await browser.close(); }

console.log(`\nAll ${passed} checks passed. Permalink: ${BASE}/${id}`);
console.log(`CLEANUP_ID=${id} USER=${username}`);
