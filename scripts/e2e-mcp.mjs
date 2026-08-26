// End-to-end proof of the Kuppi Docs MCP at /api/mcp (stateless Streamable
// HTTP) plus its REST mirrors under /api/v1/*:
//   seed via terminal-uploader endpoints → tools/list → trending_tags →
//   search → read → link → upload denied anonymously → upload with Bearer.
// Boots the production server against local Docker MinIO, like e2e-cli.mjs.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.E2E_PORT || 3212);
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

  // --- Seed one published note through the login-gated CLI surface. ---
  const username = `mcp_${randomUUID().slice(0, 8)}`;
  const password = "mcp-password-123";
  await fetch(`${BASE}/api/trpc/account.register?batch=1`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 0: { json: { fullName: "MCP Tester", contactNumber: "+94770000003", username, password, confirmPassword: password } } }),
  });
  const { token } = await fetch(`${BASE}/api/cli/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).then((r) => r.json());
  ok("seed login token", typeof token === "string" && token.length > 20);

  const seedBody = Buffer.from(`photosynthesis converts light energy into chemical energy inside the chloroplast\n`.repeat(30), "utf8");
  const presign = await fetch(`${BASE}/api/cli/presign?${new URLSearchParams({ name: "photosynthesis-notes.txt", type: "text/plain", size: String(seedBody.length) })}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const put = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: seedBody });
  ok("seed presigned PUT", put.status === 200);
  const meta = await fetch(`${BASE}/api/cli/meta`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Photosynthesis Notes", description: "Light reactions and the Calvin cycle explained.",
      subject: "Biology", studyLevel: "A/L", originalFileName: "photosynthesis-notes.txt",
      mimeType: "text/plain", storageUrl: presign.publicUrl, fileSize: seedBody.length,
    }),
  }).then((r) => r.json());
  const seededId = meta.resource?.id;
  ok("seed meta published with tags", Number.isInteger(seededId) && Array.isArray(meta.tags) && meta.tags.length > 0, JSON.stringify(meta).slice(0, 200));

  // --- MCP over real Streamable HTTP. ---
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");

  const anonTransport = new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`));
  const anon = new Client({ name: "kuppi-e2e-anon", version: "1.0.0" });
  await anon.connect(anonTransport);

  const listed = await anon.listTools();
  ok("tools/list has exactly the five kuppi tools", JSON.stringify(listed.tools.map((t) => t.name)) === JSON.stringify([
    "kuppi_trending_tags", "kuppi_search_notes", "kuppi_read_note", "kuppi_get_note_link", "kuppi_upload_note",
  ]), JSON.stringify(listed.tools.map((t) => t.name)));
  ok("upload tool declares required fields", (() => {
    const schema = listed.tools.find((t) => t.name === "kuppi_upload_note")?.inputSchema;
    return Array.isArray(schema?.required) && schema.required.includes("contentBase64");
  })());

  const trending = await anon.callTool({ name: "kuppi_trending_tags", arguments: {} });
  ok("trending_tags lists the seeded tag", !trending.isError && /#[a-z0-9-]+/.test(trending.content?.[0]?.text ?? ""), JSON.stringify(trending).slice(0, 200));

  const byTag = await anon.callTool({ name: "kuppi_search_notes", arguments: { tags: [meta.tags[0]] } });
  ok("search by tag finds the seed", !byTag.isError && (byTag.content?.[0]?.text ?? "").includes(`#${seededId} — Photosynthesis Notes`), JSON.stringify(byTag).slice(0, 300));

  const byText = await anon.callTool({ name: "kuppi_search_notes", arguments: { query: "Calvin cycle" } });
  ok("search by in-note wording finds the seed", !byText.isError && (byText.content?.[0]?.text ?? "").includes(String(seededId)), JSON.stringify(byText).slice(0, 300));

  const link = await anon.callTool({ name: "kuppi_get_note_link", arguments: { id: seededId } });
  ok("get_note_link returns permalink + stream link", !link.isError
    && (link.content?.[0]?.text ?? "").includes(`/r/${seededId}`)
    && (link.content?.[0]?.text ?? "").includes(`/f/${seededId}`), JSON.stringify(link).slice(0, 200));

  const read = await anon.callTool({ name: "kuppi_read_note", arguments: { id: seededId } });
  ok("read_note shows extracted text in chat", !read.isError && (read.content?.[0]?.text ?? "").includes("chloroplast"), JSON.stringify(read).slice(0, 300));

  const deniedUpload = await anon.callTool({
    name: "kuppi_upload_note",
    arguments: { title: "Should Not Publish", subject: "ICT", studyLevel: "A/L", filename: "nope.txt", contentBase64: Buffer.from("secret").toString("base64") },
  });
  ok("upload without login is refused", deniedUpload.isError === true && (deniedUpload.content?.[0]?.text ?? "").includes("/api/cli/login"), JSON.stringify(deniedUpload).slice(0, 200));

  await anon.close();

  // --- Authenticated client uploads inline. ---
  const authTransport = new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  const authed = new Client({ name: "kuppi-e2e-auth", version: "1.0.0" });
  await authed.connect(authTransport);

  const upload = await authed.callTool({
    name: "kuppi_upload_note",
    arguments: {
      title: "Newton's Laws Recap", subject: "Physics", studyLevel: "A/L",
      filename: "newton-recap.txt", contentBase64: Buffer.from("inertia means an object keeps moving until a force acts on it\n".repeat(20), "utf8").toString("base64"),
      description: "Quick recap before the exam.",
    },
  });
  const uploadText = upload.content?.[0]?.text ?? "";
  ok("authenticated upload publishes", !upload.isError && uploadText.includes("/r/"), JSON.stringify(upload).slice(0, 300));
  const uploadedId = Number(uploadText.match(/id:\s*(\d+)/)?.[1]);
  ok("upload response carries auto-tags", /#(inertia|force|object|keeps|moving|until)/.test(uploadText), uploadText.slice(0, 200));

  const found = await authed.callTool({ name: "kuppi_search_notes", arguments: { query: "inertia" } });
  ok("freshly uploaded note is searchable", !found.isError && (found.content?.[0]?.text ?? "").includes(String(uploadedId)), JSON.stringify(found).slice(0, 300));

  // --- REST mirrors. ---
  const restSearch = await fetch(`${BASE}/api/v1/search?q=inertia&limit=5`).then((r) => r.json());
  ok("REST /api/v1/search mirrors MCP", Array.isArray(restSearch.results) && restSearch.results.some((note) => note.id === uploadedId), JSON.stringify(restSearch).slice(0, 250));
  const restTags = await fetch(`${BASE}/api/v1/tags`).then((r) => r.json());
  ok("REST /api/v1/tags lists popular tags", Array.isArray(restTags.tags) && restTags.tags.length > 0);
  const restNote = await fetch(`${BASE}/api/v1/notes/${uploadedId}`).then((r) => r.json());
  ok("REST /api/v1/notes/:id hides storage internals", restNote.id === uploadedId && restNote.url === `/r/${uploadedId}` && !JSON.stringify(restNote).includes("storageKey"));
  const restContent = await fetch(`${BASE}/api/v1/notes/${seededId}/content?offset=0&length=50`).then((r) => r.json());
  // Requested length 50 clamps up to the 200-char minimum chunk.
  ok("REST content endpoint paginates cached text", restContent.totalChars === seedBody.length
    && restContent.offset === 0 && restContent.length === 200
    && restContent.truncated === true
    && restContent.text.startsWith("photosynthesis converts"), JSON.stringify(restContent).slice(0, 220));
  const restTail = await fetch(`${BASE}/api/v1/notes/${seededId}/content?offset=${seedBody.length - 10}`).then((r) => r.json());
  ok("REST content serves the final page", restTail.offset === seedBody.length - 10 && restTail.length === 10 && restTail.truncated === false && !restTail.text.includes("photosynthesis"), JSON.stringify(restTail).slice(0, 220));
  const restMiss = await fetch(`${BASE}/api/v1/search`);
  ok("REST search requires a filter", restMiss.status === 400);

  await authed.close();
  console.log(`\nAll ${passed} checks passed.`);
} finally {
  server.kill("SIGTERM");
}
