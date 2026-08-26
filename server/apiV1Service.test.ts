import { describe, expect, it } from "vitest";
import { DEFAULT_SNIPPET_CHARS, toCompactNote } from "./apiV1Service";

const baseResource = {
  id: 42,
  title: "Wave Motion Summary",
  description: "Full derivation of the wave equation.",
  subject: "Physics",
  studyLevel: "A/L",
  stream: null,
  examRelevance: null,
  originalFileName: "waves.pdf",
  storageKey: "kuppi/1/resources/waves.pdf",
  storageUrl: "https://storage.example/kuppi/1/resources/waves.pdf",
  mimeType: "application/pdf",
  fileSize: 12345,
  moderationStatus: "published" as const,
  extractedText: null as string | null,
  extractedAt: null as Date | null,
  authorId: 1,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  author: { id: 1, fullName: "Test Student", username: "test", role: "student" as const, createdAt: new Date() },
  likeCount: 2,
  saveCount: 1,
  commentCount: 0,
  viewerHasLiked: false,
  viewerHasSaved: false,
  tags: ["wave-motion", "al"],
};

describe("toCompactNote", () => {
  it("exposes permalinks and stream links, never storage internals", () => {
    const note = toCompactNote(baseResource);
    expect(note.url).toBe("/r/42");
    expect(note.downloadUrl).toBe("/f/42");
    expect(JSON.stringify(note)).not.toContain("storage.example");
    expect(JSON.stringify(note)).not.toContain("storageKey");
    expect(note.tags).toEqual(["wave-motion", "al"]);
  });

  it("falls back to nothing when description is blank (no text leak)", () => {
    const note = toCompactNote({ ...baseResource, description: "" });
    expect(note.snippet).toBe("");
    expect(note.snippet.length).toBeLessThanOrEqual(DEFAULT_SNIPPET_CHARS);
  });
});
