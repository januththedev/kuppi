// Serves self-hosted storage objects from local disk at /api/storage-files/{key}.
// Only active in self-hosted mode; Manus Forge deployments keep using the
// signed-URL proxy instead.

import type { Express } from "express";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { useLocalStorageSync } from "./storage";

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
};

export function registerLocalStorageFiles(app: Express) {
  app.get("/api/storage-files/*", (req, res) => {
    if (!useLocalStorageSync()) {
      res.status(404).send("Local storage is not enabled on this deployment");
      return;
    }

    const key = (req.params as Record<string, string>)[0];
    if (!key || key.includes("..") || key.split("/").some((segment) => segment.startsWith("."))) {
      res.status(400).send("Invalid storage key");
      return;
    }

    const root = process.env.KUPPI_STORAGE_DIR
      ? path.resolve(process.env.KUPPI_STORAGE_DIR)
      : path.resolve(process.cwd(), "storage-data");
    const filePath = path.resolve(root, key);
    if (!filePath.startsWith(root + path.sep)) {
      res.status(400).send("Invalid storage key");
      return;
    }

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      res.status(404).send("File not found");
      return;
    }

    const contentType = EXTENSION_CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    const fileName = path.basename(filePath);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    createReadStream(filePath).pipe(res);
  });
}
