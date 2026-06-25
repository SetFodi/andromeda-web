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

export type InlineCompletion = { text: string; url: string };

// Inline omnibox autocomplete: given the typed value and a frecency-ordered
// list of candidate URLs, returns the best prefix completion to show as a ghost
// suffix and to open on Enter. Prefers a clean domain completion (e.g. "goo" ->
// "google.com", opening the site root), then falls back to a full path match.
export function getInlineCompletion(query: string, urls: string[]): InlineCompletion | null {
  const q = query.toLowerCase();
  if (!q.trim()) {
    return null;
  }

  for (const url of urls) {
    let host: string;
    let origin: string;
    try {
      const parsed = new URL(url);
      host = parsed.hostname.replace(/^www\./, "");
      origin = parsed.origin;
    } catch {
      continue;
    }
    if (host.toLowerCase().startsWith(q) && host.length > query.length) {
      return { text: host, url: origin };
    }
  }

  for (const url of urls) {
    const display = url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (display.toLowerCase().startsWith(q) && display.length > query.length) {
      return { text: display, url };
    }
  }

  return null;
}
