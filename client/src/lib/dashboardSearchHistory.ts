const SEARCH_HISTORY_LIMIT = 5;

export function normalizeRecentSearch(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function addRecentSearch(history: string[], value: string) {
  const search = normalizeRecentSearch(value);
  if (!search) return history;
  return [search, ...history.filter((item) => item.toLocaleLowerCase() !== search.toLocaleLowerCase())].slice(0, SEARCH_HISTORY_LIMIT);
}

export function togglePinnedSearch(pinned: string[], value: string) {
  return pinned.includes(value) ? pinned.filter((item) => item !== value) : [value, ...pinned];
}

export function orderSearchHistory(history: string[], pinned: string[]) {
  return [...history].sort((left, right) => Number(pinned.includes(right)) - Number(pinned.includes(left)));
}
