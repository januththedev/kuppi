import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildKuppiMcpServer } from "./mcpServer";

vi.mock("./kuppiAuth", () => ({
  getStudentFromBearer: vi.fn(async (request: { headers: { authorization?: string } }) => {
    if (request.headers.authorization === "Bearer valid-token") {
      return { id: 7, username: "tester", fullName: "Tester", role: "student", contactNumber: "", passwordHash: "", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), contactVerifiedAt: null };
    }
    return null;
  }),
}));

vi.mock("./apiV1Service", () => {
  class NoteContentError extends Error {
    constructor(readonly code: "not_found" | "unsupported", message: string, readonly downloadUrl?: string) {
      super(message);
    }
  }
  return {
    DEFAULT_CONTENT_CHUNK: 20000,
    MAX_SEARCH_LIMIT: 50,
    MCP_UPLOAD_MAX_BYTES: 10 * 1024 * 1024,
    NoteContentError,
    popularTags: vi.fn(async () => [{ tag: "thermal-physics", count: 3 }, { tag: "al", count: 2 }]),
    searchNotes: vi.fn(async () => ({
      results: [{
        id: 9, title: "Entropy Notes", url: "/r/9", downloadUrl: "/f/9", subject: "Physics", studyLevel: "A/L",
        stream: null, examRelevance: null, mimeType: "application/pdf", fileSize: 100, originalFileName: "entropy.pdf",
        createdAt: new Date(), author: { fullName: "A B", username: "ab" }, likeCount: 0, saveCount: 0, commentCount: 0,
        tags: ["entropy"], snippet: "Second law basics.",
      }],
      relatedTags: ["thermodynamics"],
    })),
    noteMeta: vi.fn(async () => ({ id: 9, title: "Entropy Notes", url: "/r/9", downloadUrl: "/f/9", subject: "Physics", studyLevel: "A/L", stream: null, examRelevance: null, mimeType: "application/pdf", fileSize: 100, originalFileName: "entropy.pdf", createdAt: new Date(), tags: ["entropy"], textCached: true })),
    noteContent: vi.fn(async () => ({ id: 9, title: "Entropy Notes", url: "/r/9", downloadUrl: "/f/9", mimeType: "application/pdf", tags: ["entropy"], totalChars: 40, offset: 0, length: 40, truncated: false, text: "Entropy never decreases in an isolated system." })),
    uploadNote: vi.fn(async () => ({ id: 12, url: "/r/12", downloadUrl: "/f/12", tags: ["new-note"] })),
  };
});

import { getStudentFromBearer } from "./kuppiAuth";
import { popularTags, searchNotes, uploadNote } from "./apiV1Service";

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

/** Connect a fresh in-memory client to a freshly built Kuppi MCP server. */
async function connectClient(authorization?: string) {
  const server = buildKuppiMcpServer("https://kuppi.orinai.org", authorization);
  const client = new Client({ name: "vitest-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function call(name: string, args: Record<string, unknown>, authorization?: string): Promise<ToolResult> {
  const client = await connectClient(authorization);
  try {
    return (await client.callTool({ name, arguments: args })) as ToolResult;
  } finally {
    void client.close();
  }
}

describe("kuppi MCP tool surface", () => {
  beforeEach(() => {
    vi.mocked(getStudentFromBearer).mockClear();
    vi.mocked(uploadNote).mockClear();
  });

  async function listToolNames() {
    const client = await connectClient();
    try {
      const result = await client.listTools();
      return result.tools.map((tool) => tool.name);
    } finally {
      void client.close();
    }
  }

  it("exposes exactly the five kuppi tools (four read-only + one gated write)", async () => {
    expect(await listToolNames()).toEqual([
      "kuppi_trending_tags",
      "kuppi_search_notes",
      "kuppi_read_note",
      "kuppi_get_note_link",
      "kuppi_upload_note",
    ]);
  });

  it("trending_tags formats counts", async () => {
    const result = await call("kuppi_trending_tags", {});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("#thermal-physics — 3");
    expect(popularTags).toHaveBeenCalled();
  });

  it("search_notes rejects an empty query and includes related tags otherwise", async () => {
    const empty = await call("kuppi_search_notes", {});
    expect(empty.isError).toBe(true);
    const hit = await call("kuppi_search_notes", { query: "entropy" });
    expect(hit.isError).toBeFalsy();
    expect(hit.content[0].text).toContain("#9 — Entropy Notes");
    expect(hit.content[0].text).toContain("https://kuppi.orinai.org/r/9");
    expect(hit.content[0].text).toContain("#thermodynamics");
    expect(searchNotes).toHaveBeenCalled();
  });

  it("read_note returns paginated text with the permalink header", async () => {
    const result = await call("kuppi_read_note", { id: 9 });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("chars 1-40 of 40");
    expect(result.content[0].text).toContain("Entropy never decreases");
  });

  it("read_note refuses invalid ids", async () => {
    const result = await call("kuppi_read_note", { id: -3 });
    expect(result.isError).toBe(true);
  });

  it("get_note_link hands out permalink + stream link", async () => {
    const result = await call("kuppi_get_note_link", { id: 9 });
    expect(result.content[0].text).toContain("Permalink: https://kuppi.orinai.org/r/9");
    expect(result.content[0].text).toContain("/f/9");
  });

  it("upload_note requires login and explains how to authenticate", async () => {
    const denied = await call("kuppi_upload_note", { title: "x", subject: "y", studyLevel: "z", filename: "a.txt", contentBase64: "" });
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toContain("/api/cli/login");
    expect(uploadNote).not.toHaveBeenCalled();
  });

  it("upload_note publishes with a valid Bearer token", async () => {
    const allowed = await call(
      "kuppi_upload_note",
      { title: "My Note", subject: "ICT", studyLevel: "A/L", filename: "note.txt", contentBase64: Buffer.from("hello").toString("base64") },
      "Bearer valid-token",
    );
    expect(allowed.isError).toBeFalsy();
    expect(allowed.content[0].text).toContain("https://kuppi.orinai.org/r/12");
    expect(allowed.content[0].text).toContain("#new-note");
    expect(vi.mocked(getStudentFromBearer)).toHaveBeenCalled();
  });
});
