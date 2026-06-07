export type SearchEngineId = "google" | "duckduckgo" | "bing";

export const SEARCH_ENGINES: Record<SearchEngineId, { label: string; query: string }> = {
  google: { label: "Google", query: "https://www.google.com/search?q=" },
  duckduckgo: { label: "DuckDuckGo", query: "https://duckduckgo.com/?q=" },
  bing: { label: "Bing", query: "https://www.bing.com/search?q=" }
};

let currentSearchEngine: SearchEngineId = "google";

export function setSearchEngine(id: SearchEngineId): void {
  if (id in SEARCH_ENGINES) {
    currentSearchEngine = id;
  }
}

export function resolveNavigationInput(input: string): string {
  const value = input.trim();

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.includes(".") && !/\s/.test(value)) {
    return `https://${value}`;
  }

  return `${SEARCH_ENGINES[currentSearchEngine].query}${encodeURIComponent(value)}`;
}

export function getUrlDisplayValue(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname + parsed.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}
