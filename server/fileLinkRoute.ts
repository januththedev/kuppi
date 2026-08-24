// Short, stable links for every published file: /f/<id> 302-redirects to the
// underlying object URL (MinIO today, legacy Vercel Blob rows alike), so
// shareable links survive storage migrations and stay human-friendly.
// (Rich landing page lives at /r/<id> — see client ResourcePermalink.)

import type { Express } from "express";
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
      res.redirect(302, resource.storageUrl);
    } catch (error) {
      console.error("[FileLink] lookup failed:", error);
      res.status(500).send("Kuppi could not resolve that link right now.");
    }
  });
}
