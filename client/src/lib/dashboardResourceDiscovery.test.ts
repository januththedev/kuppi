import { describe, expect, it } from "vitest";
import { filterAndSortDashboardResources } from "./dashboardResourceDiscovery";

const resources = [
  { id: 1, title: "Electric fields review", description: "Practice questions for motion", originalFileName: "physics-review.pdf", subject: "Physics", studyLevel: "A/L", createdAt: "2026-01-02", likeCount: 8, saveCount: 2, commentCount: 0 },
  { id: 2, title: "Organic chemistry guide", description: "Carbon reactions and mechanisms", originalFileName: "organic.pdf", subject: "Chemistry", studyLevel: "A/L", createdAt: "2026-02-10", likeCount: 2, saveCount: 12, commentCount: 3 },
  { id: 3, title: "Physics quick notes", description: "A compact field revision note", originalFileName: "ol-field-notes.pdf", subject: "Physics", studyLevel: "O/L", createdAt: "2026-02-03", likeCount: 3, saveCount: 1, commentCount: 9 },
];

describe("filterAndSortDashboardResources", () => {
  it("filters resources by subject and study level", () => {
    expect(filterAndSortDashboardResources(resources, "", "Physics", "A/L", "newest").map((resource) => resource.id)).toEqual([1]);
  });

  it("sorts resources by aggregate popularity and discussion activity", () => {
    expect(filterAndSortDashboardResources(resources, "", "All", "All", "popular").map((resource) => resource.id)).toEqual([2, 3, 1]);
    expect(filterAndSortDashboardResources(resources, "", "All", "All", "discussed").map((resource) => resource.id)).toEqual([3, 2, 1]);
  });

  it("finds notes through titles, descriptions, and filenames", () => {
    expect(filterAndSortDashboardResources(resources, "mechanisms", "All", "All", "newest").map((resource) => resource.id)).toEqual([2]);
    expect(filterAndSortDashboardResources(resources, "field-notes", "All", "All", "newest").map((resource) => resource.id)).toEqual([3]);
  });
});
