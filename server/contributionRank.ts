export type RankResource = { id: number; authorId: number };
export type RankLike = { resourceId: number };

export function buildContributionRanking(studentIds: number[], resources: RankResource[], likes: RankLike[]) {
  const resourceAuthor = new Map(resources.map((resource) => [resource.id, resource.authorId]));
  const scores = new Map<number, number>(studentIds.map((id) => [id, 0]));
  resources.forEach((resource) => scores.set(resource.authorId, (scores.get(resource.authorId) ?? 0) + 10));
  likes.forEach((like) => {
    const authorId = resourceAuthor.get(like.resourceId);
    if (authorId) scores.set(authorId, (scores.get(authorId) ?? 0) + 1);
  });
  const ranking = studentIds
    .map((userId) => ({ userId, score: scores.get(userId) ?? 0 }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.userId - b.userId);
  return { scores, ranking };
}
