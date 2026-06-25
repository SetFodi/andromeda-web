// Public API (the lead wires these): bookmarks, folders, addBookmark(url, title, faviconUrl?, parentId?), removeBookmark(id),
// renameBookmark(id, title), moveBookmark(id, parentId), addFolder(name, parentId?) -> id, removeFolder(id), renameFolder(id, name), isBookmarked(url), toggleBookmark(url, title, faviconUrl?), importBookmarks(items) -> count.
import { useCallback, useEffect, useRef, useState } from "react";
import { quarantineCorruptValue } from "../utils/storage";

export type Bookmark = {
  id: string;
  title: string;
  url: string;
  faviconUrl?: string;
  parentId: string | null;
  createdAt: number;
};

export type BookmarkFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
};

type BookmarkStore = {
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
};

const STORAGE_KEY = "andromeda.bookmarks.v1";
const MAX_BOOKMARKS = 5000;

function randomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Normalized identity so "github.com", "https://github.com" and
// "https://github.com/" collapse to one bookmark within a folder.
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

function loadStore(): BookmarkStore {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { bookmarks: [], folders: [] };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      quarantineCorruptValue(STORAGE_KEY, raw);
      return { bookmarks: [], folders: [] };
    }

    const rawFolders: unknown[] = Array.isArray(parsed.folders) ? parsed.folders : [];
    const folders: BookmarkFolder[] = rawFolders
      .filter(
        (folder): folder is BookmarkFolder =>
          !!folder &&
          typeof (folder as BookmarkFolder).id === "string" &&
          typeof (folder as BookmarkFolder).name === "string"
      )
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: typeof folder.parentId === "string" ? folder.parentId : null,
        createdAt: typeof folder.createdAt === "number" ? folder.createdAt : Date.now()
      }));

    // Reparent dangling folder references to root so nothing is orphaned out of view.
    const folderIds = new Set(folders.map((folder) => folder.id));
    for (const folder of folders) {
      if (folder.parentId !== null && !folderIds.has(folder.parentId)) {
        folder.parentId = null;
      }
    }

    const rawBookmarks: unknown[] = Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [];
    const bookmarks: Bookmark[] = rawBookmarks
      .filter(
        (entry): entry is Bookmark =>
          !!entry &&
          typeof (entry as Bookmark).url === "string" &&
          isHttpUrl((entry as Bookmark).url)
      )
      .map((entry) => ({
        id: typeof entry.id === "string" ? entry.id : randomId("bm"),
        title: typeof entry.title === "string" ? entry.title : hostTitle(entry.url),
        url: entry.url,
        faviconUrl: typeof entry.faviconUrl === "string" ? entry.faviconUrl : undefined,
        parentId:
          typeof entry.parentId === "string" && folderIds.has(entry.parentId) ? entry.parentId : null,
        createdAt: typeof entry.createdAt === "number" ? entry.createdAt : Date.now()
      }))
      .slice(0, MAX_BOOKMARKS);

    return { bookmarks, folders };
  } catch (error) {
    quarantineCorruptValue(STORAGE_KEY, raw);
    console.warn("[andromeda] bookmarks unreadable; backed up and reset", error);
    return { bookmarks: [], folders: [] };
  }
}

export function useBookmarks() {
  const [store, setStore] = useState<BookmarkStore>(loadStore);
  const saveTimerRef = useRef<number | null>(null);
  const bookmarksRef = useRef(store.bookmarks);
  bookmarksRef.current = store.bookmarks;
  // Mirrors the full store (bookmarks + folders) so the flush-on-exit path
  // serializes the latest value without reading a stale closure.
  const storeRef = useRef(store);
  storeRef.current = store;
  // Set when a debounced write is scheduled, cleared once it lands; lets the
  // flush-on-exit path no-op when there is nothing outstanding to persist.
  const pendingWriteRef = useRef(false);

  // Single write site: serializes the latest store from the ref under
  // STORAGE_KEY. Shared by the debounced timer and the flush-on-exit path
  // below so the serialization lives in one place.
  const writeStore = useCallback(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ bookmarks: storeRef.current.bookmarks.slice(0, MAX_BOOKMARKS), folders: storeRef.current.folders })
      );
    } catch {
      // ignore storage failures
    }
    pendingWriteRef.current = false;
  }, []);

  useEffect(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    pendingWriteRef.current = true;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      writeStore();
    }, 800);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [store, writeStore]);

  // Flush immediately when the window is closing or hidden so a debounced
  // change is never lost on quit / reload / app switch. pagehide is the
  // primary teardown signal; visibilitychange-hidden is the backstop.
  useEffect(() => {
    const flush = () => {
      if (!pendingWriteRef.current) {
        return;
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      writeStore();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [writeStore]);

  const addBookmark = useCallback(
    (url: string, title: string, faviconUrl?: string, parentId: string | null = null) => {
      if (!isHttpUrl(url)) {
        return;
      }
      const key = keyFor(url);
      setStore((current) => {
        const pid = parentId !== null && current.folders.some((f) => f.id === parentId) ? parentId : null;
        if (current.bookmarks.some((b) => b.parentId === pid && keyFor(b.url) === key)) {
          return current;
        }
        if (current.bookmarks.length >= MAX_BOOKMARKS) {
          return current;
        }
        const bookmark: Bookmark = {
          id: randomId("bm"),
          title: title.trim() || hostTitle(url),
          url,
          faviconUrl: faviconUrl?.trim() || undefined,
          parentId: pid,
          createdAt: Date.now()
        };
        return { ...current, bookmarks: [bookmark, ...current.bookmarks] };
      });
    },
    []
  );

  const removeBookmark = useCallback((id: string) => {
    setStore((current) => ({ ...current, bookmarks: current.bookmarks.filter((b) => b.id !== id) }));
  }, []);

  const renameBookmark = useCallback((id: string, title: string) => {
    setStore((current) => {
      const index = current.bookmarks.findIndex((b) => b.id === id);
      if (index < 0) {
        return current;
      }
      const next = [...current.bookmarks];
      next[index] = { ...next[index], title: title.trim() || next[index].title };
      return { ...current, bookmarks: next };
    });
  }, []);

  const moveBookmark = useCallback((id: string, parentId: string | null) => {
    setStore((current) => {
      const index = current.bookmarks.findIndex((b) => b.id === id);
      if (index < 0) {
        return current;
      }
      const pid = parentId !== null && current.folders.some((f) => f.id === parentId) ? parentId : null;
      if (current.bookmarks[index].parentId === pid) {
        return current;
      }
      const next = [...current.bookmarks];
      next[index] = { ...next[index], parentId: pid };
      return { ...current, bookmarks: next };
    });
  }, []);

  const addFolder = useCallback((name: string, parentId: string | null = null): string => {
    const id = randomId("fold");
    setStore((current) => {
      const pid = parentId !== null && current.folders.some((f) => f.id === parentId) ? parentId : null;
      const folder: BookmarkFolder = {
        id,
        name: name.trim() || "New folder",
        parentId: pid,
        createdAt: Date.now()
      };
      return { ...current, folders: [...current.folders, folder] };
    });
    return id;
  }, []);

  const removeFolder = useCallback((id: string) => {
    setStore((current) => {
      const target = current.folders.find((f) => f.id === id);
      if (!target) {
        return current;
      }
      const newParent = target.parentId;
      return {
        folders: current.folders
          .filter((f) => f.id !== id)
          .map((f) => (f.parentId === id ? { ...f, parentId: newParent } : f)),
        bookmarks: current.bookmarks.map((b) => (b.parentId === id ? { ...b, parentId: newParent } : b))
      };
    });
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    setStore((current) => {
      const index = current.folders.findIndex((f) => f.id === id);
      if (index < 0) {
        return current;
      }
      const next = [...current.folders];
      next[index] = { ...next[index], name: name.trim() || next[index].name };
      return { ...current, folders: next };
    });
  }, []);

  const isBookmarked = useCallback((url: string): boolean => {
    const key = keyFor(url);
    return bookmarksRef.current.some((b) => keyFor(b.url) === key);
  }, []);

  const toggleBookmark = useCallback((url: string, title: string, faviconUrl?: string) => {
    if (!isHttpUrl(url)) {
      return;
    }
    const key = keyFor(url);
    setStore((current) => {
      if (current.bookmarks.some((b) => keyFor(b.url) === key)) {
        return { ...current, bookmarks: current.bookmarks.filter((b) => keyFor(b.url) !== key) };
      }
      if (current.bookmarks.length >= MAX_BOOKMARKS) {
        return current;
      }
      const bookmark: Bookmark = {
        id: randomId("bm"),
        title: title.trim() || hostTitle(url),
        url,
        faviconUrl: faviconUrl?.trim() || undefined,
        parentId: null,
        createdAt: Date.now()
      };
      return { ...current, bookmarks: [bookmark, ...current.bookmarks] };
    });
  }, []);

  // Bulk-merge imported bookmarks into the root level. Dedupes against existing
  // root bookmarks; returns the count of genuinely new bookmarks added.
  const importBookmarks = useCallback((items: Array<{ url: string; title: string }>): number => {
    const rootKeys = new Set(
      bookmarksRef.current.filter((b) => b.parentId === null).map((b) => keyFor(b.url))
    );
    let added = 0;
    for (const item of items) {
      if (
        isHttpUrl(item.url) &&
        !rootKeys.has(keyFor(item.url)) &&
        bookmarksRef.current.length + added < MAX_BOOKMARKS
      ) {
        rootKeys.add(keyFor(item.url));
        added += 1;
      }
    }
    if (added === 0) {
      return 0;
    }

    setStore((current) => {
      const existing = new Set(
        current.bookmarks.filter((b) => b.parentId === null).map((b) => keyFor(b.url))
      );
      const additions: Bookmark[] = [];
      for (const item of items) {
        if (!isHttpUrl(item.url)) {
          continue;
        }
        const key = keyFor(item.url);
        if (existing.has(key) || current.bookmarks.length + additions.length >= MAX_BOOKMARKS) {
          continue;
        }
        existing.add(key);
        additions.push({
          id: randomId("bm"),
          title: item.title.trim() || hostTitle(item.url),
          url: item.url,
          parentId: null,
          createdAt: Date.now()
        });
      }
      if (additions.length === 0) {
        return current;
      }
      return { ...current, bookmarks: [...additions, ...current.bookmarks] };
    });
    return added;
  }, []);

  return {
    bookmarks: store.bookmarks,
    folders: store.folders,
    addBookmark,
    removeBookmark,
    renameBookmark,
    moveBookmark,
    addFolder,
    removeFolder,
    renameFolder,
    isBookmarked,
    toggleBookmark,
    importBookmarks
  };
}
