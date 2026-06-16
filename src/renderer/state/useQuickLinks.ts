import { useCallback, useEffect, useRef, useState } from "react";

export type QuickLink = {
  id: string;
  label: string;
  url: string;
};

const STORAGE_KEY = "andromeda.quickLinks.v1";

const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { id: "ql-github", label: "GitHub", url: "https://github.com" },
  { id: "ql-linear", label: "Linear", url: "https://linear.app" },
  { id: "ql-youtube", label: "YouTube", url: "https://youtube.com" },
  { id: "ql-figma", label: "Figma", url: "https://figma.com" },
  { id: "ql-notion", label: "Notion", url: "https://notion.so" },
  { id: "ql-gmail", label: "Gmail", url: "https://mail.google.com" },
  { id: "ql-reddit", label: "Reddit", url: "https://reddit.com" },
  { id: "ql-x", label: "X", url: "https://x.com" }
];

function normalizeKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function deriveLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const base = host.split(".")[0] ?? host;
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return url;
  }
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function loadQuickLinks(): QuickLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_QUICK_LINKS;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return DEFAULT_QUICK_LINKS;
    }

    const links = parsed
      .filter(
        (item): item is QuickLink =>
          item &&
          typeof item.id === "string" &&
          typeof item.label === "string" &&
          typeof item.url === "string" &&
          isValidUrl(item.url)
      )
      .slice(0, 16);

    return links;
  } catch {
    return DEFAULT_QUICK_LINKS;
  }
}

export function useQuickLinks() {
  const initialRef = useRef<QuickLink[] | null>(null);
  if (!initialRef.current) {
    initialRef.current = loadQuickLinks();
  }

  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(initialRef.current);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(quickLinks));
    } catch {
      // ignore storage failures
    }
  }, [quickLinks]);

  const addQuickLink = useCallback((url: string, label?: string) => {
    if (!isValidUrl(url)) {
      return;
    }

    const key = normalizeKey(url);
    setQuickLinks((current) => {
      if (current.some((link) => normalizeKey(link.url) === key)) {
        return current;
      }

      const link: QuickLink = {
        id: `ql-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        label: (label && label.trim()) || deriveLabel(url),
        url
      };

      return [...current, link].slice(0, 16);
    });
  }, []);

  const removeQuickLink = useCallback((id: string) => {
    setQuickLinks((current) => current.filter((link) => link.id !== id));
  }, []);

  // Bulk-add imported shortcuts, filling up to the tile cap and skipping any
  // URL we already have. Returns the count actually added.
  const importLinks = useCallback((links: Array<{ url: string; label?: string }>) => {
    let added = 0;
    setQuickLinks((current) => {
      const seen = new Set(current.map((link) => normalizeKey(link.url)));
      const next = [...current];
      for (const item of links) {
        if (next.length >= 16) {
          break;
        }
        if (!isValidUrl(item.url)) {
          continue;
        }
        const key = normalizeKey(item.url);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        next.push({
          id: `ql-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${added}`,
          label: (item.label && item.label.trim()) || deriveLabel(item.url),
          url: item.url
        });
        added += 1;
      }
      return next;
    });
    return added;
  }, []);

  const reorderQuickLink = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) {
      return;
    }
    setQuickLinks((current) => {
      const from = current.findIndex((link) => link.id === sourceId);
      const to = current.findIndex((link) => link.id === targetId);
      if (from < 0 || to < 0) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const toggleQuickLink = useCallback((url: string, label?: string) => {
    if (!isValidUrl(url)) {
      return;
    }

    const key = normalizeKey(url);
    setQuickLinks((current) => {
      if (current.some((link) => normalizeKey(link.url) === key)) {
        return current.filter((link) => normalizeKey(link.url) !== key);
      }

      const link: QuickLink = {
        id: `ql-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        label: (label && label.trim()) || deriveLabel(url),
        url
      };

      return [...current, link].slice(0, 16);
    });
  }, []);

  const isQuickLink = useCallback(
    (url: string | null | undefined) => {
      if (!url) {
        return false;
      }
      const key = normalizeKey(url);
      return quickLinks.some((link) => normalizeKey(link.url) === key);
    },
    [quickLinks]
  );

  return {
    quickLinks,
    addQuickLink,
    importLinks,
    removeQuickLink,
    reorderQuickLink,
    toggleQuickLink,
    isQuickLink
  };
}
