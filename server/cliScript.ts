// Source of the Kuppi terminal uploader, served verbatim by GET /api/cli/script
// with __KUPPI_ORIGIN__ replaced by the deployment origin. Kept as a string so
// it ships inside the serverless bundle without filesystem access.
// NOTE: intentionally avoids backticks and ${ so it lives in one template
// literal; use plain quotes and concatenation when editing.

export const CLI_SCRIPT_SOURCE = `#!/usr/bin/env node
// Kuppi terminal uploader — publish many files at once from PowerShell, CMD,
// or any bash/zsh shell. Zero dependencies; Node 18+ required.
//
//   1. Download:   curl -fsSL __KUPPI_ORIGIN__/api/cli/script -o kuppi-upload.mjs
//      (PowerShell: curl.exe -fsSL "__KUPPI_ORIGIN__/api/cli/script" -o kuppi-upload.mjs)
//   2. Run:        node kuppi-upload.mjs --user <username> file1.pdf notes2.html ...
//
// Options:
//   --url <origin>    Site to upload to (default: __KUPPI_ORIGIN__)
//   --user <name>     Your Kuppi username (env KUPPI_USER also works)
//   --pass <secret>   Your password — omitted = you will be prompted (env KUPPI_PASS)
//   --subject <s>     Subject for every file (default "General")
//   --level <l>       Study level (default "A/L")
//   --jobs <n>        Parallel uploads (default 3)
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { webcrypto as crypto } from "node:crypto";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const MIME = {
  ".pdf": "application/pdf", ".html": "text/html", ".htm": "text/html",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".txt": "text/plain", ".md": "text/markdown",
  ".csv": "text/csv", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4",
  ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function parseArgs(argv) {
  const opts = { url: "__KUPPI_ORIGIN__", user: process.env.KUPPI_USER || "", pass: process.env.KUPPI_PASS || "", subject: "General", level: "A/L", jobs: 3, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url") opts.url = argv[++i];
    else if (arg === "--user") opts.user = argv[++i];
    else if (arg === "--pass") opts.pass = argv[++i];
    else if (arg === "--subject") opts.subject = argv[++i];
    else if (arg === "--level") opts.level = argv[++i];
    else if (arg === "--jobs") opts.jobs = Math.max(1, Number(argv[++i]) || 3);
    else if (arg === "-h" || arg === "--help") { console.log("see file header for usage"); process.exit(0); }
    else opts.files.push(arg);
  }
  return opts;
}

async function promptHidden(question) {
  const rl = readline.createInterface({ input, output });
  output.write(question);
  let secret = "";
  if (process.platform === "win32") {
    // PowerShell/CMD have no standard hidden read; fall back to visible input.
    secret = await rl.question("");
  } else {
    const wasRaw = input.isRaw;
    if (input.setRawMode) input.setRawMode(true);
    for (;;) {
      const chunk = await new Promise((resolve) => input.once("data", resolve));
      const text = String(chunk);
      if (text.includes("\\r") || text.includes("\\n")) break;
      secret += text;
    }
    if (input.setRawMode) input.setRawMode(wasRaw ?? false);
  }
  rl.close();
  output.write("\\n");
  return secret.trim();
}

async function api(origin, path, options) {
  const res = await fetch(origin + path, options);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error((body && body.error && body.error.message) || ("HTTP " + res.status + ": " + text.slice(0, 200)));
  return body;
}

async function uploadOne(origin, token, filePath, meta) {
  const size = (await readFile(filePath)).length;
  const name = basename(filePath);
  const type = MIME[extname(name).toLowerCase()] || "application/octet-stream";
  const qs = new URLSearchParams({ name, type, size: String(size) });
  const presign = await api(origin, "/api/cli/presign?" + qs, { headers: { Authorization: "Bearer " + token } });
  const put = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": type },
    body: createReadStream(filePath),
    duplex: "half",
  });
  if (!put.ok) throw new Error("storage rejected " + name + " (HTTP " + put.status + ")");
  const created = await api(origin, "/api/cli/meta", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: name.replace(/\\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 180),
      description: "Uploaded from the terminal. " + meta.description,
      subject: meta.subject,
      studyLevel: meta.level,
      originalFileName: name,
      mimeType: type,
      storageUrl: presign.publicUrl,
      fileSize: size,
    }),
  });
  return created.resource || created;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.files.length) { console.error("No files given. Usage: node kuppi-upload.mjs --user you file1 [file2 ...]"); process.exit(2); }
  opts.url = opts.url.replace(/\\/+$/, "");
  if (!opts.user) { console.error("--user is required"); process.exit(2); }
  if (!opts.pass) opts.pass = await promptHidden("Kuppi password for " + opts.user + ": ");
  if (!opts.pass) { console.error("Password required"); process.exit(2); }

  let token;
  try {
    const login = await api(opts.url, "/api/cli/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: opts.user, password: opts.pass }),
    });
    token = login.token;
  } catch (error) {
    console.error("Login failed:", error.message);
    process.exit(1);
  }
  console.log("Signed in as " + opts.user + ". Uploading " + opts.files.length + " file(s)...");

  const queue = [...opts.files];
  const results = { ok: [], failed: [] };
  async function worker() {
    while (queue.length) {
      const file = queue.shift();
      try {
        const resource = await uploadOne(opts.url, token, file, { subject: opts.subject, level: opts.level, description: opts.description || "" });
        results.ok.push(file);
        const tags = Array.isArray(resource.tags) ? resource.tags : [];
        const tagNote = tags.length ? "   tagged: " + tags.map(function (t) { return "#" + t; }).join(" ") : "";
        console.log("  \u2714 " + file + "  ->  /r/" + resource.id + tagNote);
      } catch (error) {
        results.failed.push(file);
        console.error("  ✘ " + file + ": " + error.message);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.jobs, opts.files.length) }, worker));

  console.log("");
  console.log("Done. Published: " + results.ok.length + ", failed: " + results.failed.length + ".");
  if (results.failed.length) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
`;
