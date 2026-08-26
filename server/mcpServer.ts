// Kuppi Docs MCP — remote Model Context Protocol endpoint at /api/mcp.
//
// Stateless Streamable HTTP (fresh Server+Transport per request, JSON
// responses): the documented serverless-safe pattern — no SSE session
// affinity problems on Vercel.
//
// Reads are public (only published content exists behind them). The single
// write tool, kuppi_upload_note, requires a student login via
// `Authorization: Bearer <token>` — the same session JWT issued by
// POST /api/cli/login — configured as a header in the AI client.
//
// Tool schemas are plain JSON Schema with manual argument validation on
// purpose: the app pins zod v4 while the SDK's schema plumbing expects its
// own zod v3 instance, so we keep zero coupling between them.

import type { Express } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getStudentFromBearer } from "./kuppiAuth";
import {
  DEFAULT_CONTENT_CHUNK,
  MAX_SEARCH_LIMIT,
  MCP_UPLOAD_MAX_BYTES,
  NoteContentError,
  noteContent,
  noteMeta,
  popularTags,
  searchNotes,
  uploadNote,
} from "./apiV1Service";

type JsonSchema = Record<string, unknown>;

function noteTools(origin: string) {
  const absolute = (path: string) => (origin ? `${origin}${path}` : path);
  return [
    {
      name: "kuppi_trending_tags",
      description:
        "List the most-used auto-generated hashtags across Kuppi's public study-note library (Sri Lankan student resources). Zero-cost discovery entry point: browse what topics exist before searching.",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 1, maximum: 100, default: 20, description: "How many tags to return." } },
        additionalProperties: false,
      } satisfies JsonSchema,
    },
    {
      name: "kuppi_search_notes",
      description:
        "Search Kuppi's public study notes by free-text query and/or auto-generated hashtags. Returns compact results only (id, title, tags, snippet, links) — never full documents. Call kuppi_read_note on promising ids for the actual content.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text search over titles, descriptions, subjects, streams, and extracted note text." },
          tags: { type: "array", items: { type: "string" }, maxItems: 8, description: "Auto-generated hashtag slugs to match (any of), e.g. [\"thermal-physics\", \"al\"]." },
          subject: { type: "string", description: "Exact subject filter, e.g. \"Combined Maths\", \"Physics\", \"ICT\"." },
          studyLevel: { type: "string", description: "Exact study-level filter, e.g. \"A/L\", \"O/L\", \"University\"." },
          limit: { type: "integer", minimum: 1, maximum: MAX_SEARCH_LIMIT, default: 12 },
        },
        additionalProperties: false,
      } satisfies JsonSchema,
    },
    {
      name: "kuppi_read_note",
      description:
        "Read a Kuppi note's extracted plain text (PDFs and images are OCR'd/parsed server-side once and cached). Paginated for token efficiency — use offset/length for long notes. Answers should cite the returned permalink.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "integer", minimum: 1, description: "Note id from kuppi_search_notes." },
          offset: { type: "integer", minimum: 0, default: 0 },
          length: { type: "integer", minimum: 200, maximum: 40000, default: DEFAULT_CONTENT_CHUNK },
        },
        required: ["id"],
        additionalProperties: false,
      } satisfies JsonSchema,
    },
    {
      name: "kuppi_get_note_link",
      description: "Get the shareable permalink and direct stream/download link for a Kuppi note id, plus its hashtags.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", minimum: 1 } },
        required: ["id"],
        additionalProperties: false,
      } satisfies JsonSchema,
    },
    {
      name: "kuppi_upload_note",
      description:
        "Publish a study note to Kuppi (login REQUIRED via the client's Authorization: Bearer session JWT from POST /api/cli/login). Accepts up to 10 MB inline base64; larger files go through the terminal uploader or website. Hashtags are generated automatically from the content. Returns the new note id, permalink, and tags.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", minLength: 3, maxLength: 180 },
          subject: { type: "string", minLength: 2, maxLength: 80 },
          studyLevel: { type: "string", minLength: 2, maxLength: 40 },
          filename: { type: "string", description: "Plain file name including extension, e.g. \"wave-motion-notes.pdf\".", maxLength: 255 },
          contentBase64: { type: "string", description: "Base64-encoded file bytes (inline, max ~10 MB decoded)." },
          mimeType: { type: "string", description: "Optional MIME type; guessed from the extension when omitted." },
          description: { type: "string", maxLength: 5000 },
          stream: { type: "string", maxLength: 80 },
          examRelevance: { type: "string", maxLength: 100 },
        },
        required: ["title", "subject", "studyLevel", "filename", "contentBase64"],
        additionalProperties: false,
      } satisfies JsonSchema,
    },
  ];
}

function toolText(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

async function handleToolCall(name: string, args: Record<string, unknown>, origin: string, authHeader: string | undefined): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const absolute = (path: string) => `${origin}${path}`;
  switch (name) {
    case "kuppi_trending_tags": {
      const limit = typeof args.limit === "number" ? args.limit : 20;
      const tags = await popularTags({ limit });
      if (!tags.length) return toolText("No hashtags yet — the library has no tagged notes.");
      return toolText(tags.map((tag) => `#${tag.tag} — ${tag.count} note(s)`).join("\n"));
    }
    case "kuppi_search_notes": {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      const tags = Array.isArray(args.tags) ? args.tags.filter((tag): tag is string => typeof tag === "string") : [];
      const subject = typeof args.subject === "string" && args.subject.trim() ? args.subject.trim() : undefined;
      const studyLevel = typeof args.studyLevel === "string" && args.studyLevel.trim() ? args.studyLevel.trim() : undefined;
      if (!query && !tags.length && !subject && !studyLevel) {
        return toolText("Give a query, one or more tags, a subject, or a studyLevel to search.", true);
      }
      const { results, relatedTags } = await searchNotes({
        query: query || undefined,
        tags: tags.length ? tags : undefined,
        subject,
        studyLevel,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
      if (!results.length) return toolText("No published notes matched. Try broader terms or browse kuppi_trending_tags.");
      const lines = results.map((note) =>
        [`#${note.id} — ${note.title}`, `  by @${note.author.username} · ${note.subject} · ${note.studyLevel} · ${note.originalFileName} (${note.mimeType})`, `  tags: ${note.tags.length ? note.tags.map((tag) => "#" + tag).join(" ") : "(none)"}`, `  snippet: ${note.snippet || "(no preview)"}`, `  link: ${absolute(note.url)} | text: kuppi_read_note(id:${note.id})`].join("\n"),
      );
      const related = relatedTags.length ? `\n\nRelated hashtags to narrow further: ${relatedTags.map((tag) => "#" + tag).join(" ")}` : "";
      return toolText(`${results.length} note(s):\n\n${lines.join("\n\n")}${related}`);
    }
    case "kuppi_read_note": {
      if (!Number.isInteger(args.id) || Number(args.id) <= 0) return toolText("A positive integer id is required.", true);
      const offset = typeof args.offset === "number" && args.offset > 0 ? Math.floor(args.offset) : 0;
      const length = typeof args.length === "number" && args.length >= 200 ? Math.floor(Math.min(args.length, 40000)) : DEFAULT_CONTENT_CHUNK;
      try {
        const note = await noteContent(Number(args.id), offset, length);
        const header = `${note.title}\n${absolute(note.url)}\ntags: ${note.tags.map((tag) => "#" + tag).join(" ") || "(none)"}\n[chars ${note.offset + 1}-${note.offset + note.length} of ${note.totalChars}${note.truncated ? " — more remain; call again with a higher offset" : ""}]\n\n`;
        return toolText(header + note.text);
      } catch (error) {
        if (error instanceof NoteContentError) {
          const suffix = error.downloadUrl ? ` Download the original instead: ${absolute(error.downloadUrl)}` : "";
          return toolText(error.message + suffix, error.code !== "unsupported");
        }
        throw error;
      }
    }
    case "kuppi_get_note_link": {
      if (!Number.isInteger(args.id) || Number(args.id) <= 0) return toolText("A positive integer id is required.", true);
      const note = await noteMeta(Number(args.id));
      if (!note) return toolText(`No published note #${Number(args.id)} exists.`);
      return toolText([`${note.title}`, `Permalink: ${absolute(note.url)}`, `Open/download: ${absolute(note.downloadUrl)}`, `Hashtags: ${note.tags.map((tag) => "#" + tag).join(" ") || "(none)"}`].join("\n"));
    }
    case "kuppi_upload_note": {
      const student = await getStudentFromBearer({ headers: { authorization: authHeader ?? "" } } as Parameters<typeof getStudentFromBearer>[0]);
      if (!student) {
        return toolText(
          "Uploads require your Kuppi student login. One-time setup:\n"
          + `1) curl -X POST ${origin}/api/cli/login -H "Content-Type: application/json" -d '{"username":"YOUR_USERNAME","password":"YOUR_PASSWORD"}'  -> copy .token\n`
          + '2) add it to this MCP server\'s config headers: {"Authorization":"Bearer <token>"} (valid 14 days, re-login to refresh).\n'
          + "Reading/searching stays open without any login.",
          true,
        );
      }
      const missing = (["title", "subject", "studyLevel", "filename", "contentBase64"] as const).filter((field) => typeof args[field] !== "string" || !(args[field] as string).trim());
      if (missing.length) return toolText(`Missing required field(s): ${missing.join(", ")}.`, true);
      try {
        const created = await uploadNote(student, {
          title: String(args.title),
          subject: String(args.subject),
          studyLevel: String(args.studyLevel),
          filename: String(args.filename),
          contentBase64: String(args.contentBase64),
          mimeType: typeof args.mimeType === "string" ? args.mimeType : undefined,
          description: typeof args.description === "string" ? args.description : undefined,
          stream: typeof args.stream === "string" ? args.stream : undefined,
          examRelevance: typeof args.examRelevance === "string" ? args.examRelevance : undefined,
        });
        return toolText(`Published to Kuppi.\nid: ${created.id}\npermalink: ${absolute(created.url)}\nopen/download: ${absolute(created.downloadUrl)}\nauto-hashtags: ${created.tags.map((tag) => "#" + tag).join(" ") || "(none derived)"}`);
      } catch (error) {
        return toolText(error instanceof Error ? error.message : "Upload failed.", true);
      }
    }
    default:
      return toolText(`Unknown tool: ${name}`, true);
  }
}

export function buildKuppiMcpServer(origin: string, authHeader?: string) {
  const server = new Server({ name: "kuppi-docs", version: "1.0.0" }, { capabilities: { tools: {} } });
  const tools = noteTools(origin);
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      return await handleToolCall(name, args, origin, authHeader);
    } catch (error) {
      console.error("[MCP] tool call failed:", name, error instanceof Error ? error.message : error);
      return toolText("Kuppi could not complete that request right now.", true);
    }
  });
  return server;
}

/** Derive the deployment origin for absolute links (behind proxies too). */
function requestOrigin(req: import("express").Request): string {
  const host = req.get("x-forwarded-host") ?? req.get("host");
  if (!host) return "";
  const proto = String(req.get("x-forwarded-proto") ?? req.protocol ?? "https").split(",")[0].trim();
  return `${proto}://${host}`;
}

export function registerMcpRoutes(app: Express) {
  const cors = (req: import("express").Request, res: import("express").Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, mcp-session-id, last-event-id, mcp-protocol-version");
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
    void req;
  };

  app.options("/api/mcp", (req, res) => {
    cors(req, res);
    res.status(204).end();
  });

  app.post("/api/mcp", async (req, res) => {
    cors(req, res);
    try {
      // Stateless: everything is rebuilt per request, keyed to this exact
      // req/res pair — which is also how the Bearer header reaches the
      // upload tool without any session store.
      const server = buildKuppiMcpServer(requestOrigin(req), req.headers.authorization);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("[MCP] request failed:", error instanceof Error ? error.message : error);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  });

  // Stateless JSON mode keeps no event streams or sessions.
  app.get("/api/mcp", (req, res) => {
    cors(req, res);
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless JSON mode)." }, id: null });
  });
  app.delete("/api/mcp", (req, res) => {
    cors(req, res);
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless JSON mode)." }, id: null });
  });
}

export { MCP_UPLOAD_MAX_BYTES };
