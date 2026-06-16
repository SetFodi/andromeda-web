import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type HistoryEntry = {
  url: string;
  title: string;
  faviconUrl?: string;
  visitCount: number;
  typedCount: number;
  lastVisited: number;
};

const STORAGE_KEY = "andromeda.history.v1";
const MAX_ENTRIES = 800;

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Normalized identity so "github.com", "https://github.com" and
// "https://github.com/" collapse to one entry.
function keyFor(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.host}${path}${parsed.search}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function hostTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function frecency(entry: HistoryEntry): number {
  const base = entry.visitCount + entry.typedCount * 2;
  const ageDays = (Date.now() - entry.lastVisited) / 86_400_000;
  const recency = ageDays < 1 ? 3 : ageDays < 4 ? 2 : ageDays < 14 ? 1 : 0.4;
  return base * recency;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (entry): entry is HistoryEntry =>
          entry &&
          typeof entry.url === "string" &&
          isHttpUrl(entry.url) &&
          typeof entry.visitCount === "number" &&
          typeof entry.lastVisited === "number"
      )
      .map((entry) => ({
        url: entry.url,
        title: typeof entry.title === "string" ? entry.title : hostTitle(entry.url),
        faviconUrl: typeof entry.faviconUrl === "string" ? entry.faviconUrl : undefined,
        visitCount: entry.visitCount,
        typedCount: typeof entry.typedCount === "number" ? entry.typedCount : 0,
        lastVisited: entry.lastVisited
      }))
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(loadHistory);
  const saveTimerRef = useRef<number | null>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
      } catch {
        // ignore storage failures
      }
    }, 800);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [entries]);

  const recordVisit = useCallback((url: string, title?: string) => {
    if (!isHttpUrl(url)) {
      return;
    }
    const key = keyFor(url);
    setEntries((current) => {
      const index = current.findIndex((entry) => keyFor(entry.url) === key);
      if (index >= 0) {
        const existing = current[index];
        const next = [...current];
        next[index] = {
          ...existing,
          url,
          title: title?.trim() || existing.title,
          visitCount: existing.visitCount + 1,
          lastVisited: Date.now()
        };
        return next;
      }
      return [
        { url, title: title?.trim() || hostTitle(url), visitCount: 1, typedCount: 0, lastVisited: Date.now() },
        ...current
      ].slice(0, MAX_ENTRIES);
    });
  }, []);

  const recordTyped = useCallback((url: string) => {
    if (!isHttpUrl(url)) {
      return;
    }
    const key = keyFor(url);
    setEntries((current) => {
      const index = current.findIndex((entry) => keyFor(entry.url) === key);
      if (index >= 0) {
        const existing = current[index];
        const next = [...current];
        next[index] = { ...existing, typedCount: existing.typedCount + 1, lastVisited: Date.now() };
        return next;
      }
      return [
        { url, title: hostTitle(url), visitCount: 0, typedCount: 1, lastVisited: Date.now() },
        ...current
      ].slice(0, MAX_ENTRIES);
    });
  }, []);

  const updateMeta = useCallback((url: string, meta: { title?: string; faviconUrl?: string }) => {
    const key = keyFor(url);
    setEntries((current) => {
      const index = current.findIndex((entry) => keyFor(entry.url) === key);
      if (index < 0) {
        return current;
      }
      const existing = current[index];
      const nextTitle = meta.title?.trim() && meta.title.trim() !== existing.title ? meta.title.trim() : existing.title;
      const nextFavicon = meta.faviconUrl && meta.faviconUrl !== existing.faviconUrl ? meta.faviconUrl : existing.faviconUrl;
      if (nextTitle === existing.title && nextFavicon === existing.faviconUrl) {
        return current;
      }
      const next = [...current];
      next[index] = { ...existing, title: nextTitle, faviconUrl: nextFavicon };
      return next;
    });
  }, []);

  const deleteEntry = useCallback((url: string) => {
    const key = keyFor(url);
    setEntries((current) => current.filter((entry) => keyFor(entry.url) !== key));
  }, []);

  const clearAll = useCallback(() => setEntries([]), []);

  // Bulk-merge imported pages (e.g. from another browser). Dedupes against the
  // existing entries; returns the count of genuinely new pages added.
  const importEntries = useCallback(
    (incoming: Array<{ url: string; title?: string; visitCount?: number; lastVisited?: number }>) => {
      const existingKeys = new Set(entriesRef.current.map((entry) => keyFor(entry.url)));
      let added = 0;
      for (const item of incoming) {
        if (isHttpUrl(item.url) && !existingKeys.has(keyFor(item.url))) {
          existingKeys.add(keyFor(item.url));
          added += 1;
        }
      }
      if (added === 0 && incoming.length === 0) {
        return 0;
      }

      setEntries((current) => {
        const byKey = new Map(current.map((entry) => [keyFor(entry.url), entry]));
        for (const item of incoming) {
          if (!isHttpUrl(item.url)) {
            continue;
          }
          const key = keyFor(item.url);
          const existing = byKey.get(key);
          if (existing) {
            byKey.set(key, {
              ...existing,
              visitCount: Math.max(existing.visitCount, item.visitCount ?? 1),
              lastVisited: Math.max(existing.lastVisited, item.lastVisited ?? 0),
              title: existing.title || item.title?.trim() || hostTitle(item.url)
            });
          } else {
            byKey.set(key, {
              url: item.url,
              title: item.title?.trim() || hostTitle(item.url),
              visitCount: item.visitCount ?? 1,
              typedCount: 0,
              lastVisited: item.lastVisited ?? Date.now()
            });
          }
        }
        return Array.from(byKey.values())
          .sort((a, b) => b.lastVisited - a.lastVisited)
          .slice(0, MAX_ENTRIES);
      });
      return added;
    },
    []
  );

  // Ranked by frecency (visits + typed + recency) so the omnibar surfaces the
  // sites you actually use most.
  const items = useMemo(
    () => [...entries].sort((a, b) => frecency(b) - frecency(a)).slice(0, 80),
    [entries]
  );

  // Chronological (newest first) for the history view.
  const recent = useMemo(() => [...entries].sort((a, b) => b.lastVisited - a.lastVisited), [entries]);

  return { items, recent, recordVisit, recordTyped, updateMeta, deleteEntry, clearAll, importEntries };
}
