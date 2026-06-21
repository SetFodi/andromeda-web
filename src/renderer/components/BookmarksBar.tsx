import { memo, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { getFaviconSrc } from "../utils/favicon";
import type { Bookmark, BookmarkFolder } from "../state/useBookmarks";

type BookmarksBarProps = {
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
  onOpenUrl: (url: string) => void;
};

function shortTitle(bookmark: Bookmark): string {
  const title = bookmark.title.trim();
  if (title) {
    return title;
  }
  try {
    return new URL(bookmark.url).hostname.replace(/^www\./, "");
  } catch {
    return bookmark.url;
  }
}

function BarFavicon({ url, faviconUrl }: { url: string; faviconUrl?: string }) {
  const [failed, setFailed] = useState(false);
  const src = getFaviconSrc(url, faviconUrl);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span className="bookmark-bar-fav">
      {src && !failed ? (
        <img alt="" src={src} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Icon name="globe" size={13} />
      )}
    </span>
  );
}

function BookmarksBar({ bookmarks, folders, onOpenUrl }: BookmarksBarProps) {
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const rootBookmarks = bookmarks.filter((b) => b.parentId === null);
  const rootFolders = folders.filter((f) => f.parentId === null);

  useEffect(() => {
    if (openFolderId === null) {
      return;
    }
    const onPointer = (event: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setOpenFolderId(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenFolderId(null);
      }
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [openFolderId]);

  if (rootBookmarks.length === 0 && rootFolders.length === 0) {
    return null;
  }

  // Earliest-added first so the row stays stable as new items are appended.
  const items = [
    ...rootFolders.map((folder) => ({ kind: "folder" as const, item: folder })),
    ...rootBookmarks.map((bookmark) => ({ kind: "bookmark" as const, item: bookmark }))
  ].sort((a, b) => a.item.createdAt - b.item.createdAt);

  return (
    <div className="bookmark-bar" ref={barRef}>
      {items.map((entry) => {
        if (entry.kind === "bookmark") {
          const bookmark = entry.item;
          return (
            <button
              key={bookmark.id}
              type="button"
              className="bookmark-bar-item"
              title={bookmark.url}
              onClick={() => onOpenUrl(bookmark.url)}
            >
              <BarFavicon url={bookmark.url} faviconUrl={bookmark.faviconUrl} />
              <span className="bookmark-bar-label">{shortTitle(bookmark)}</span>
            </button>
          );
        }

        const folder = entry.item;
        const isOpen = openFolderId === folder.id;
        const children = bookmarks.filter((b) => b.parentId === folder.id);
        return (
          <div key={folder.id} className="bookmark-bar-folder">
            <button
              type="button"
              className={isOpen ? "bookmark-bar-item is-open" : "bookmark-bar-item"}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              title={folder.name}
              onClick={() => setOpenFolderId(isOpen ? null : folder.id)}
            >
              <span className="bookmark-bar-fav">
                <Icon name="folder" size={13} />
              </span>
              <span className="bookmark-bar-label">{folder.name}</span>
              <Icon name="chevronRight" size={12} className="bookmark-bar-caret" />
            </button>
            {isOpen ? (
              <div className="bookmark-bar-dropdown" role="menu" aria-label={folder.name}>
                {children.length === 0 ? (
                  <span className="bookmark-bar-empty">Empty</span>
                ) : (
                  children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      role="menuitem"
                      className="bookmark-bar-dropitem"
                      title={child.url}
                      onClick={() => {
                        onOpenUrl(child.url);
                        setOpenFolderId(null);
                      }}
                    >
                      <BarFavicon url={child.url} faviconUrl={child.faviconUrl} />
                      <span className="bookmark-bar-label">{shortTitle(child)}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default memo(BookmarksBar);
