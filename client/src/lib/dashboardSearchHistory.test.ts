import { describe, expect, it } from "vitest";
import { addRecentSearch, normalizeRecentSearch, orderSearchHistory, togglePinnedSearch } from "./dashboardSearchHistory";

describe("Kuppi dashboard search history", () => {
  it("normalizes a query and places it at the front without duplicate entries", () => {
    expect(normalizeRecentSearch("  organic   chemistry ")).toBe("organic chemistry");
    expect(addRecentSearch(["Physics", "Organic Chemistry"], " organic chemistry ")).toEqual(["organic chemistry", "Physics"]);
  });

  it("retains only the five most recent meaningful queries", () => {
    expect(addRecentSearch(["one", "two", "three", "four", "five"], "six")).toEqual(["six", "one", "two", "three", "four"]);
    expect(addRecentSearch(["one"], "   ")).toEqual(["one"]);
  });

  it("pins queries at the top and supports unpinning", () => {
    expect(orderSearchHistory(["physics", "chemistry", "biology"], ["biology"])).toEqual(["biology", "physics", "chemistry"]);
    expect(togglePinnedSearch(["biology"], "physics")).toEqual(["physics", "biology"]);
    expect(togglePinnedSearch(["biology"], "biology")).toEqual([]);
  });
});
