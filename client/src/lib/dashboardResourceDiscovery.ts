export type DashboardSort = "newest" | "popular" | "liked" | "saved" | "discussed";

export type DashboardResource = {
  title: string;
  description?: string;
  originalFileName?: string;
  subject: string;
  studyLevel: string;
  createdAt: Date | string;
  likeCount: number;
  saveCount: number;
  commentCount: number;
};

export function filterAndSortDashboardResources<T extends DashboardResource>(resources: T[], query: string, subject: string, studyLevel: string, sort: DashboardSort): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = resources.filter((resource) => {
    const matchesQuery = !normalizedQuery || [resource.title, resource.description, resource.originalFileName, resource.subject, resource.studyLevel].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);
    return matchesQuery && (subject === "All" || resource.subject === subject) && (studyLevel === "All" || resource.studyLevel === studyLevel);
  });
  return [...filtered].sort((left, right) => {
    if (sort === "popular") return (right.likeCount + right.saveCount + right.commentCount) - (left.likeCount + left.saveCount + left.commentCount);
    if (sort === "liked") return right.likeCount - left.likeCount;
    if (sort === "saved") return right.saveCount - left.saveCount;
    if (sort === "discussed") return right.commentCount - left.commentCount;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}
