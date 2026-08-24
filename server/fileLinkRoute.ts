// Short, branded links for every published file: /f/<id> streams the object
// THROUGH Kuppi so the underlying storage URL (MinIO today, legacy Vercel
// Blob rows alike) never appears in a visitor's address bar.
// (Rich landing page lives at /r/<id> — see client ResourcePermalink.)

import type { Express } from "express";
import { Readable } from "node:stream";
import { getResourceById } from "./kuppiDb";

export function registerFileLinkRoute(app: Express) {
  app.get("/f/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(404).send("This Kuppi link does not exist.");
      return;
    }
    try {
      const resource = await getResourceById(id);
      if (!resource) {
        res.status(404).send("This resource is no longer available.");
        return;
      }
      const upstream = await fetch(resource.storageUrl);
      if (!upstream.ok || !upstream.body) {
        res.status(502).send("Kuppi could not fetch this file right now.");
        return;
      }
      // Render inline where the browser can (HTML/PDF/media); everything else
      // downloads under its original name.
      const previewable = /^(text\/|application\/pdf|image\/|video\/|audio\/)/i.test(resource.mimeType);
      const safeName = resource.originalFileName.replace(/["\\\r\n]/g, "_");
      res.status(200);
      res.setHeader("Content-Type", upstream.headers.get("content-type") ?? resource.mimeType ?? "application/octet-stream");
      res.setHeader("Content-Disposition", `${previewable ? "inline" : "attachment"}; filename="${safeName}"`);
      res.setHeader("Cache-Control", "public, max-age=3600");
      const stream = Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream);
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    } catch (error) {
      console.error("[FileLink] lookup failed:", error);
      res.status(500).send("Kuppi could not resolve that link right now.");
    }
  });
}
