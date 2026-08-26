// REST surface for the Kuppi terminal uploader (server/cliScript.ts).
// Students on PowerShell/CMD/bash authenticate with a Bearer session token
// (same JWT the web app sets as a cookie), then stream files straight to
// object storage via presigned PUTs — the server only ever sees metadata.

import type { Express } from "express";
import {
  createSessionToken,
  getStudentFromBearer,
  normalizeUsername,
  verifyPassword,
} from "./kuppiAuth";
import { createResource, getStudentByUsername } from "./kuppiDb";
import { storageKeyFromUrl, storageMode } from "./storage";
import { s3PresignedPut } from "./s3Storage";
import { MAX_UPLOAD_BYTES, safeStorageName } from "./resourceSafety";
import { tagResourceSafe } from "./autoTagger";
import { CLI_SCRIPT_SOURCE } from "./cliScript";

export function registerCliUploadRoutes(app: Express) {
  app.post("/api/cli/login", async (req, res) => {
    const username = typeof req.body?.username === "string" ? normalizeUsername(req.body.username) : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!username || !password) {
      res.status(400).json({ error: { message: "Username and password are required." } });
      return;
    }
    try {
      const student = await getStudentByUsername(username);
      if (!student || !(await verifyPassword(password, student.passwordHash))) {
        res.status(401).json({ error: { message: "That username and password do not match." } });
        return;
      }
      res.json({ token: await createSessionToken(student), username: student.username });
    } catch (error) {
      console.error("[CliUpload] login failed:", error);
      res.status(500).json({ error: { message: "Kuppi could not sign you in right now." } });
    }
  });

  app.get("/api/cli/presign", async (req, res) => {
    const student = await getStudentFromBearer(req);
    if (!student) {
      res.status(401).json({ error: { message: "Run /api/cli/login first and send Authorization: Bearer <token>." } });
      return;
    }
    if (storageMode() !== "s3") {
      res.status(400).json({ error: { message: "Terminal uploads need this deployment to run S3-compatible storage." } });
      return;
    }
    const name = String(req.query.name ?? "").trim();
    const mimeType = String(req.query.type ?? "").trim() || "application/octet-stream";
    const size = Number(req.query.size);
    if (!name || name.length > 255 || /[\\/]/.test(name)) {
      res.status(400).json({ error: { message: "A plain file name is required." } });
      return;
    }
    if (!Number.isInteger(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
      res.status(413).json({ error: { message: "Files must be larger than empty and 30 MB or smaller." } });
      return;
    }
    try {
      const key = `kuppi/${student.id}/resources/${safeStorageName(name)}`;
      const target = await s3PresignedPut(key, mimeType);
      res.json({ key, uploadUrl: target.uploadUrl, publicUrl: target.publicUrl });
    } catch (error) {
      console.error("[CliUpload] presign failed:", error);
      res.status(500).json({ error: { message: "Kuppi could not prepare that upload." } });
    }
  });

  app.post("/api/cli/meta", async (req, res) => {
    const student = await getStudentFromBearer(req);
    if (!student) {
      res.status(401).json({ error: { message: "Missing or expired session token." } });
      return;
    }
    const body = req.body ?? {};
    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const studyLevel = String(body.studyLevel ?? "").trim();
    const storageUrl = String(body.storageUrl ?? "");
    const originalFileName = String(body.originalFileName ?? "").trim();
    const fileSize = Number(body.fileSize);
    if (title.length < 3 || title.length > 180) {
      res.status(400).json({ error: { message: "Title must be 3-180 characters." } });
      return;
    }
    if (subject.length < 2 || studyLevel.length < 2) {
      res.status(400).json({ error: { message: "Subject and study level are required (at least 2 characters)." } });
      return;
    }
    if (!/^https?:\/\//i.test(storageUrl)) {
      res.status(400).json({ error: { message: "storageUrl must be an absolute http(s) URL." } });
      return;
    }
    if (!originalFileName || originalFileName.length > 255) {
      res.status(400).json({ error: { message: "A valid original file name is required." } });
      return;
    }
    if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
      res.status(400).json({ error: { message: "fileSize must reflect an uploaded file of 30 MB or less." } });
      return;
    }
    try {
      // Only trust URLs our own presign flow could have produced.
      const expectedBase = `${process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, "") || `${(process.env.S3_ENDPOINT ?? "").replace(/\/+$/, "")}/${process.env.S3_BUCKET || "kuppi-uploads"}`}`;
      if (!storageUrl.startsWith(expectedBase + "/")) {
        res.status(400).json({ error: { message: "storageUrl does not point at this deployment's object storage." } });
        return;
      }
      const created = await createResource({
        authorId: student.id,
        title,
        description: description.slice(0, 5000),
        subject: subject.slice(0, 80),
        studyLevel: studyLevel.slice(0, 40),
        stream: null,
        examRelevance: null,
        originalFileName,
        storageKey: storageKeyFromUrl(storageUrl) ?? storageUrl,
        storageUrl,
        mimeType: String(body.mimeType ?? "application/octet-stream").slice(0, 160),
        fileSize,
      });
      // Auto-hashtags from content; returned separately so the terminal
      // script can print them. Best-effort — never blocks the publish.
      const tags = await tagResourceSafe({
        resourceId: created.resource.id,
        title, description, subject, studyLevel,
        mimeType: created.resource.mimeType,
        storageKey: created.resource.storageKey,
      });
      res.json({ resource: created.resource, tags });
    } catch (error) {
      console.error("[CliUpload] meta failed:", error);
      res.status(400).json({ error: { message: error instanceof Error ? error.message : "Kuppi could not publish that upload." } });
    }
  });

  app.get("/api/cli/script", (req, res) => {
    const proto = req.protocol;
    const host = req.get("host") ?? "";
    const origin = `${proto}://${host}`;
    res.set("Content-Type", "text/javascript; charset=utf-8");
    res.set("Content-Disposition", 'attachment; filename="kuppi-upload.mjs"');
    res.set("Cache-Control", "no-store");
    res.send(CLI_SCRIPT_SOURCE.replaceAll("__KUPPI_ORIGIN__", origin));
  });
}
