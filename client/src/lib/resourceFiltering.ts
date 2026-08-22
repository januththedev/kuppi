export type KuppiResourceFilterInput = {
  title: string;
  description: string;
  subject: string;
  author: string;
  stream: string;
  level: string;
};

export function filterKuppiResources<T extends KuppiResourceFilterInput>(
  resources: T[],
  query: string,
  activeFilter: string,
  activeSubject: string,
): T[] {
  const normalizedQuery = query.trim().toLowerCase();

  return resources.filter((resource) => {
    const matchesQuery = !normalizedQuery || [
      resource.title,
      resource.description,
      resource.subject,
      resource.author,
      resource.stream,
    ].join(" ").toLowerCase().includes(normalizedQuery);
    const matchesFilter = activeFilter === "All resources" || resource.level === activeFilter || resource.stream === activeFilter;
    const matchesSubject = activeSubject === "For you" || resource.subject === activeSubject;

    return matchesQuery && matchesFilter && matchesSubject;
  });
}
