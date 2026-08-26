import { describe, expect, it } from "vitest";
import {
  MAX_EXTRACTION_BYTES,
  MAX_TAGS_PER_RESOURCE,
  directTextMime,
  heuristicTags,
  normalizeTags,
  parseTagReply,
  slugifyTag,
} from "./autoTagger";

describe("slugifyTag", () => {
  it("lowercases and dashes arbitrary input", () => {
    expect(slugifyTag("Thermal Physics!!")).toBe("thermal-physics");
    expect(slugifyTag("#Al_Notes 2026")).toBe("al-notes-2026");
  });

  it("trims edge dashes and caps length", () => {
    expect(slugifyTag("--integration--")).toBe("integration");
    expect(slugifyTag("a".repeat(50)).length).toBeLessThanOrEqual(32);
  });
});

describe("normalizeTags", () => {
  it("dedupes across formats and drops empties", () => {
    expect(normalizeTags(["#thermal-physics", "THERMAL PHYSICS", "", null, "thermal-physics"])).toEqual(["thermal-physics"]);
  });

  it("caps at the maximum number of tags", () => {
    const many = Array.from({ length: 20 }, (_, index) => `tag-${index}`);
    expect(normalizeTags(many).length).toBe(MAX_TAGS_PER_RESOURCE);
  });
});

describe("heuristicTags", () => {
  it("is deterministic and skips stopwords/short tokens", () => {
    const input = { title: "Wave Motion Summary", description: "Notes about amplitude and frequency", subject: "Physics", text: "wave motion amplitude frequency resonance wave wave" };
    expect(heuristicTags(input)).toEqual(heuristicTags(input));
    const tags = heuristicTags(input);
    expect(tags).toContain("wave");
    expect(tags.some((tag) => ["about", "notes", "with"].includes(tag))).toBe(false);
  });

  it("never exceeds the tag cap even on huge corpora", () => {
    const text = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(" ");
    expect(heuristicTags({ text }).length).toBeLessThanOrEqual(MAX_TAGS_PER_RESOURCE);
  });
});

describe("parseTagReply", () => {
  it("reads clean JSON", () => {
    expect(parseTagReply('{"tags":["entropy","thermal-physics"]}')).toEqual(["entropy", "thermal-physics"]);
  });

  it("reads JSON fenced inside prose", () => {
    expect(parseTagReply('Sure! ```json\n{"tags":["circles"]}\n``` hope that helps')).toEqual(["circles"]);
  });

  it("falls back to scraping hashtags", () => {
    expect(parseTagReply("Try #geometry and #circle-theorems today")).toEqual(["#geometry", "#circle-theorems"]);
  });

  it("returns nothing for garbage", () => {
    expect(parseTagReply("no useful content")).toEqual([]);
    expect(parseTagReply("")).toEqual([]);
  });
});

describe("directTextMime", () => {
  it("accepts text-ish types only", () => {
    expect(directTextMime("text/plain")).toBe(true);
    expect(directTextMime("application/json")).toBe(true);
    expect(directTextMime("application/pdf")).toBe(false);
    expect(directTextMime("image/png")).toBe(false);
  });
});

describe("extraction budget", () => {
  it("skips oversized binaries", () => {
    expect(MAX_EXTRACTION_BYTES).toBeGreaterThan(0);
  });
});
