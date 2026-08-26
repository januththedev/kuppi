// Thin public READ surface for AI clients and scripts, mirroring exactly what
// the remote MCP tools call (server/apiV1Service.ts). No write endpoints live
// here — uploads happen through the website UI, the terminal uploader
// (/api/cli/*), or the MCP upload tool; all three are login-gated.

import type { Express } from "express";
import {
  MAX_SEARCH_LIMIT,
  NoteContentError,
  noteContent,
  noteMeta,
  popularTags,
  searchNotes,
} from "./apiV1Service";

function jsonError(res: import("express").Response, status: number, message: string, extra: Record<string, unknown> = {}) {
  res.status(status).json({ error: { message, ...extra } });
}

export function registerApiV1Routes(app: Express) {
  app.get("/api/v1/search", async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 180) : undefined;
    const tags = typeof req.query.tags === "string" ? req.query.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 8) : undefined;
    const subject = typeof req.query.subject === "string" ? req.query.subject.trim().slice(0, 80) : undefined;
    const studyLevel = typeof req.query.studyLevel === "string" ? req.query.studyLevel.trim().slice(0, 40) : undefined;
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_SEARCH_LIMIT) : 12;
    if (!query && !tags?.length && !subject && !studyLevel) {
      jsonError(res, 400, "Provide at least one of q, tags, subject, or studyLevel.");
      return;
    }
    try {
      res.json(await searchNotes({ query, tags, subject, studyLevel, limit }));
    } catch (error) {
      console.error("[ApiV1] search failed:", error);
      jsonError(res, 500, "Kuppi could not run that search right now.");
    }
  });

  app.get("/api/v1/tags", async (req, res) => {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100) : 20;
    const prefix = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase().replace(/^#+/, "").slice(0, 64) : undefined;
    try {
      res.json({ tags: await popularTags({ limit, prefix }) });
    } catch (error) {
      console.error("[ApiV1] tags failed:", error);
      jsonError(res, 500, "Kuppi could not list tags right now.");
    }
  });

  app.get("/api/v1/notes/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      jsonError(res, 404, "This Kuppi link does not exist.");
      return;
    }
    try {
      const note = await noteMeta(id);
      if (!note) {
        jsonError(res, 404, "That resource is no longer available.");
        return;
      }
      res.json(note);
    } catch (error) {
      console.error("[ApiV1] note meta failed:", error);
      jsonError(res, 500, "Kuppi could not fetch that note right now.");
    }
  });

  app.get("/api/v1/notes/:id/content", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      jsonError(res, 404, "This Kuppi link does not exist.");
      return;
    }
    const offsetRaw = Number(req.query.offset);
    const lengthRaw = Number(req.query.length);
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
    const length = Number.isFinite(lengthRaw) && lengthRaw > 0 ? Math.floor(lengthRaw) : undefined;
    try {
      res.json(await noteContent(id, offset, length));
    } catch (error) {
      if (error instanceof NoteContentError) {
        if (error.code === "not_found") jsonError(res, 404, error.message);
        else jsonError(res, 415, error.message, { downloadUrl: error.downloadUrl });
        return;
      }
      console.error("[ApiV1] note content failed:", error);
      jsonError(res, 500, "Kuppi could not read that note right now.");
    }
  });
}
