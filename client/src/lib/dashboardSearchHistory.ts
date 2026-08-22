const SEARCH_HISTORY_LIMIT = 5;

export function normalizeRecentSearch(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function addRecentSearch(history: string[], value: string) {
  const search = normalizeRecentSearch(value);
  if (!search) return history;
  return [search, ...history.filter((item) => item.toLocaleLowerCase() !== search.toLocaleLowerCase())].slice(0, SEARCH_HISTORY_LIMIT);
}
