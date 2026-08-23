// Authenticated bridge for browser→Vercel Blob direct uploads.
// The @vercel/blob client calls this route to obtain a short-lived upload
// token; the file itself never passes through this server, which is what
// allows large (up to MAX_UPLOAD_BYTES) files on serverless platforms.

import type { Express } from "express";
import { getStudentFromRequest } from "./kuppiAuth";
import { useVercelBlobStorage } from "./storage";
import { MAX_UPLOAD_BYTES } from "./resourceSafety";

export function registerBlobUploadRoute(app: Express) {
  app.post("/api/blob-upload", async (req, res) => {
    const student = await getStudentFromRequest(req);
    if (!student) {
      res.status(401).json({ error: { message: "Please sign in to continue." } });
      return;
    }
    if (!useVercelBlobStorage()) {
      res.status(400).json({ error: { message: "Direct uploads are only available on Vercel Blob deployments." } });
      return;
    }

    try {
      const { handleUpload } = await import("@vercel/blob/client");
      const json = await handleUpload({
        request: req,
        body: req.body,
        onBeforeGenerateToken: async () => ({
          // Empty array = every content type allowed; Kuppi accepts any
          // study material the student has.
          allowedContentTypes: [],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ userId: student.id }),
        }),
      });
      res.status(200).json(json);
    } catch (error) {
      console.error("[BlobUpload] token issue failed:", error);
      res.status(400).json({ error: { message: error instanceof Error ? error.message : "Kuppi could not start that upload." } });
    }
  });
}
