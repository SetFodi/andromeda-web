import { memo, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { getFaviconSrc } from "../utils/favicon";
import type { Bookmark, BookmarkFolder } from "../state/useBookmarks";

type BookmarksPanelProps = {
  isOpen: boolean;
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
  onClose: () => void;
  onOpenUrl: (url: string) => void;
  onRemove: (id: string) => void;
  onRemoveFolder: (id: string) => void;
  onAddFolder: (name: string) => void;
  onRenameBookmark: (id: string, title: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onMoveBookmark: (id: string, parentId: string | null) => void;
};

type EditTarget = { kind: "bookmark" | "folder"; id: string };

type FolderGroup = { folder: BookmarkFolder; items: Bookmark[] };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function BookmarkFavicon({ url, faviconUrl }: { url: string; faviconUrl?: string }) {
  const [failed, setFailed] = useState(false);
  const src = getFaviconSrc(url, faviconUrl);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span className="bookmark-favicon">
      {src && !failed ? (
        <img alt="" src={src} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Icon name="globe" size={15} />
      )}
    </span>
  );
}

function BookmarksPanel({
  isOpen,
  bookmarks,
  folders,
  onClose,
  onOpenUrl,
  onRemove,
  onRemoveFolder,
  onAddFolder,
  onRenameBookmark,
  onRenameFolder,
  onMoveBookmark
}: BookmarksPanelProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimerRef = useRef<number | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setConfirmClear(false);
      setAddingFolder(false);
      setNewFolderName("");
      setEditing(null);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) {
        window.clearTimeout(confirmTimerRef.current);
      }
    };
  }, []);

  const { rootItems, folderGroups, hasMatches } = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const visible = bookmarks.filter(
      (b) =>
        !normalized || b.title.toLowerCase().includes(normalized) || b.url.toLowerCase().includes(normalized)
    );

    const groups: FolderGroup[] = [...folders]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((folder) => ({ folder, items: visible.filter((b) => b.parentId === folder.id) }))
      .filter((group) => !normalized || group.items.length > 0);

    const roots = visible.filter((b) => b.parentId === null);
    return {
      rootItems: roots,
      folderGroups: groups,
      hasMatches: roots.length > 0 || groups.some((group) => group.items.length > 0)
    };
  }, [bookmarks, folders, query]);

  if (!isOpen) {
    return null;
  }

  const normalized = query.trim();
  const isEmpty = normalized ? !hasMatches : bookmarks.length === 0 && folders.length === 0;

  const handleClearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      if (confirmTimerRef.current !== null) {
        window.clearTimeout(confirmTimerRef.current);
      }
      confirmTimerRef.current = window.setTimeout(() => setConfirmClear(false), 3200);
      return;
    }
    if (confirmTimerRef.current !== null) {
      window.clearTimeout(confirmTimerRef.current);
    }
    setConfirmClear(false);
    for (const bookmark of bookmarks) {
      onRemove(bookmark.id);
    }
    for (const folder of folders) {
      onRemoveFolder(folder.id);
    }
  };

  const commitNewFolder = () => {
    const name = newFolderName.trim();
    if (name) {
      onAddFolder(name);
    }
    setNewFolderName("");
    setAddingFolder(false);
  };

  const startEditing = (target: EditTarget, value: string) => {
    setEditing(target);
    setEditValue(value);
  };

  const commitEditing = () => {
    if (!editing) {
      return;
    }
    const value = editValue.trim();
    if (value) {
      if (editing.kind === "bookmark") {
        onRenameBookmark(editing.id, value);
      } else {
        onRenameFolder(editing.id, value);
      }
    }
    setEditing(null);
  };

  const renderBookmarkRow = (bookmark: Bookmark) => {
    const isEditing = editing?.kind === "bookmark" && editing.id === bookmark.id;
    return (
      <div key={bookmark.id} className="bookmark-row">
        {isEditing ? (
          <input
            className="bookmark-rename"
            autoFocus
            value={editValue}
            aria-label="Rename bookmark"
            spellCheck={false}
            onChange={(event) => setEditValue(event.target.value)}
            onBlur={commitEditing}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitEditing();
              } else if (event.key === "Escape") {
                event.stopPropagation();
                setEditing(null);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="bookmark-open"
            title={bookmark.url}
            onDoubleClick={() => startEditing({ kind: "bookmark", id: bookmark.id }, bookmark.title)}
            onClick={() => {
              onOpenUrl(bookmark.url);
              onClose();
            }}
          >
            <BookmarkFavicon url={bookmark.url} faviconUrl={bookmark.faviconUrl} />
            <span className="bookmark-copy">
              <span className="bookmark-title">{bookmark.title || hostOf(bookmark.url)}</span>
              <small>{hostOf(bookmark.url)}</small>
            </span>
          </button>
        )}
        <span className="bookmark-actions">
          <select
            className="bookmark-move"
            aria-label={`Move ${bookmark.title || hostOf(bookmark.url)} to folder`}
            value={bookmark.parentId ?? ""}
            onChange={(event) => onMoveBookmark(bookmark.id, event.target.value || null)}
          >
            <option value="">Bookmarks</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="bookmark-action"
            aria-label={`Rename ${bookmark.title || hostOf(bookmark.url)}`}
            title="Rename"
            onClick={() => startEditing({ kind: "bookmark", id: bookmark.id }, bookmark.title)}
          >
            <Icon name="pencil" size={14} />
          </button>
          <button
            type="button"
            className="bookmark-del"
            aria-label={`Remove ${bookmark.title || hostOf(bookmark.url)} from bookmarks`}
            title="Remove"
            onClick={() => onRemove(bookmark.id)}
          >
            <Icon name="trash" size={14} />
          </button>
        </span>
      </div>
    );
  };

  return (
    <div className="bookmarks-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="bookmarks-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Bookmarks"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <header className="bookmarks-head">
          <h2>Bookmarks</h2>
          <div className="bookmarks-head-actions">
            <button
              type="button"
              className="bookmarks-addfolder"
              aria-label="Add folder"
              title="Add folder"
              onClick={() => {
                setAddingFolder(true);
                setNewFolderName("");
              }}
            >
              <Icon name="plus" size={15} />
              <span>Folder</span>
            </button>
            <button className="settings-close" type="button" aria-label="Close bookmarks" onClick={onClose}>
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>

        <div className="bookmarks-search">
          <Icon name="search" size={17} />
          <input
            ref={searchRef}
            value={query}
            placeholder="Search bookmarks"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {addingFolder ? (
          <div className="bookmarks-newfolder">
            <Icon name="folder" size={16} />
            <input
              autoFocus
              value={newFolderName}
              placeholder="Folder name"
              spellCheck={false}
              aria-label="New folder name"
              onChange={(event) => setNewFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitNewFolder();
                } else if (event.key === "Escape") {
                  event.stopPropagation();
                  setAddingFolder(false);
                  setNewFolderName("");
                }
              }}
            />
            <button type="button" className="bookmarks-newfolder-add" onClick={commitNewFolder}>
              Add
            </button>
          </div>
        ) : null}

        <div className="bookmarks-body">
          {isEmpty ? (
            <div className="bookmarks-empty">
              <Icon name="star" size={22} />
              <span>{normalized ? "No matching bookmarks" : "No bookmarks yet"}</span>
            </div>
          ) : (
            <>
              {rootItems.length > 0 ? (
                <div className="bookmarks-group">
                  <div className="bookmarks-grouplabel">Bookmarks</div>
                  {rootItems.map(renderBookmarkRow)}
                </div>
              ) : null}

              {folderGroups.map(({ folder, items }) => {
                const isEditingFolder = editing?.kind === "folder" && editing.id === folder.id;
                return (
                  <div key={folder.id} className="bookmarks-group">
                    <div className="bookmarks-folderhead">
                      <span className="bookmarks-folderlabel">
                        <Icon name="folder" size={14} />
                        {isEditingFolder ? (
                          <input
                            className="bookmark-rename"
                            autoFocus
                            value={editValue}
                            aria-label="Rename folder"
                            spellCheck={false}
                            onChange={(event) => setEditValue(event.target.value)}
                            onBlur={commitEditing}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitEditing();
                              } else if (event.key === "Escape") {
                                event.stopPropagation();
                                setEditing(null);
                              }
                            }}
                          />
                        ) : (
                          <span
                            className="bookmarks-foldername"
                            onDoubleClick={() => startEditing({ kind: "folder", id: folder.id }, folder.name)}
                          >
                            {folder.name}
                          </span>
                        )}
                      </span>
                      <span className="bookmarks-folderactions">
                        <button
                          type="button"
                          className="bookmark-action"
                          aria-label={`Rename folder ${folder.name}`}
                          title="Rename folder"
                          onClick={() => startEditing({ kind: "folder", id: folder.id }, folder.name)}
                        >
                          <Icon name="pencil" size={14} />
                        </button>
                        <button
                          type="button"
                          className="bookmark-del"
                          aria-label={`Remove folder ${folder.name}`}
                          title="Remove folder"
                          onClick={() => onRemoveFolder(folder.id)}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </span>
                    </div>
                    {items.length > 0 ? (
                      items.map(renderBookmarkRow)
                    ) : (
                      <div className="bookmarks-folderempty">Empty</div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <footer className="bookmarks-foot">
          <span>{bookmarks.length === 1 ? "1 bookmark" : `${bookmarks.length} bookmarks`}</span>
          <button
            className={confirmClear ? "bookmarks-clear is-confirming" : "bookmarks-clear"}
            type="button"
            disabled={bookmarks.length === 0 && folders.length === 0}
            onClick={handleClearAll}
          >
            {confirmClear ? "Confirm — clear everything" : "Clear all"}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default memo(BookmarksPanel);
