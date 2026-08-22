import { describe, expect, it } from "vitest";
import { addRecentSearch, normalizeRecentSearch } from "./dashboardSearchHistory";

describe("Kuppi dashboard search history", () => {
  it("normalizes a query and places it at the front without duplicate entries", () => {
    expect(normalizeRecentSearch("  organic   chemistry ")).toBe("organic chemistry");
    expect(addRecentSearch(["Physics", "Organic Chemistry"], " organic chemistry ")).toEqual(["organic chemistry", "Physics"]);
  });

  it("retains only the five most recent meaningful queries", () => {
    expect(addRecentSearch(["one", "two", "three", "four", "five"], "six")).toEqual(["six", "one", "two", "three", "four"]);
    expect(addRecentSearch(["one"], "   ")).toEqual(["one"]);
  });
});
