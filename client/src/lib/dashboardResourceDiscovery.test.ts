import { describe, expect, it } from "vitest";
import { filterAndSortDashboardResources } from "./dashboardResourceDiscovery";

const resources = [
  { id: 1, subject: "Physics", studyLevel: "A/L", createdAt: "2026-01-02", likeCount: 8, saveCount: 2, commentCount: 0 },
  { id: 2, subject: "Chemistry", studyLevel: "A/L", createdAt: "2026-02-10", likeCount: 2, saveCount: 12, commentCount: 3 },
  { id: 3, subject: "Physics", studyLevel: "O/L", createdAt: "2026-02-03", likeCount: 3, saveCount: 1, commentCount: 9 },
];

describe("filterAndSortDashboardResources", () => {
  it("filters resources by subject and study level", () => {
    expect(filterAndSortDashboardResources(resources, "Physics", "A/L", "newest").map((resource) => resource.id)).toEqual([1]);
  });

  it("sorts resources by aggregate popularity and discussion activity", () => {
    expect(filterAndSortDashboardResources(resources, "All", "All", "popular").map((resource) => resource.id)).toEqual([2, 3, 1]);
    expect(filterAndSortDashboardResources(resources, "All", "All", "discussed").map((resource) => resource.id)).toEqual([3, 2, 1]);
  });
});
