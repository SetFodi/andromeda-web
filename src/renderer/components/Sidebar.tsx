import { memo, useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import type { BrowserSpace, BrowserTab, SpaceId } from "../state/browserStore";
import Icon, { IconName } from "./Icon";

type SidebarProps = {
  spaces: BrowserSpace[];
  selectedSpaceId: SpaceId;
  onSelectSpace: (spaceId: SpaceId) => void;
  onCreateSpace: () => SpaceId;
  onRenameSpace: (spaceId: SpaceId, name: string) => void;
  onDeleteSpace: (spaceId: SpaceId) => void;
  onSelectTab: (spaceId: SpaceId, tabId: string) => void;
  onCloseTab: (spaceId: SpaceId, tabId: string) => void;
  onTogglePinTab: (spaceId: SpaceId, tabId: string) => void;
  onReorderTabs: (spaceId: SpaceId, sourceTabId: string, targetTabId: string) => void;
  onTabDragStart: (event: DragEvent<HTMLElement>, tab: BrowserTab) => void;
  onTabDragEnd: () => void;
  draggedTabId: string | null;
  onNewTab: () => void;
};

function getTabSubtitle(tab: BrowserTab): string {
  if (tab.isStartPage || !tab.url) {
    return "Local start page";
  }

  return getTabHostname(tab) ?? tab.url;
}

function getTabFallbackIcon(tab: BrowserTab): IconName {
  if (tab.isStartPage) {
    return "docs";
  }

  const hostname = getTabHostname(tab);
  if (hostname === "github.com" || hostname?.endsWith(".github.com")) {
    return "github";
  }

  if (hostname === "linear.app" || hostname?.endsWith(".linear.app")) {
    return "linear";
  }

  return "globe";
}

function getTabHostname(tab: BrowserTab): string | null {
  if (!tab.url) {
    return null;
  }

  try {
    return new URL(tab.url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function TabFavicon({ tab }: { tab: BrowserTab }) {
  const [failedFaviconUrl, setFailedFaviconUrl] = useState<string | null>(null);
  const showFavicon = Boolean(
    tab.faviconUrl && !tab.isStartPage && tab.faviconUrl !== failedFaviconUrl
  );

  useEffect(() => {
    setFailedFaviconUrl(null);
  }, [tab.faviconUrl]);

  return (
    <span className="tab-favicon">
      {showFavicon ? (
        <img
          alt=""
          src={tab.faviconUrl}
          onError={() => setFailedFaviconUrl(tab.faviconUrl ?? null)}
        />
      ) : (
        <Icon name={getTabFallbackIcon(tab)} size={15} />
      )}
    </span>
  );
}

function Sidebar({
  spaces,
  selectedSpaceId,
  onSelectSpace,
  onCreateSpace,
  onRenameSpace,
  onDeleteSpace,
  onSelectTab,
  onCloseTab,
  onTogglePinTab,
  onReorderTabs,
  onTabDragStart,
  onTabDragEnd,
  draggedTabId,
  onNewTab
}: SidebarProps) {
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0];
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingSpaceId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [editingSpaceId]);

  const beginRename = (space: BrowserSpace) => {
    setDraftName(space.name);
    setEditingSpaceId(space.id);
  };

  const commitRename = () => {
    if (editingSpaceId) {
      onRenameSpace(editingSpaceId, draftName);
    }
    setEditingSpaceId(null);
  };

  const handleCreateSpace = () => {
    const newSpaceId = onCreateSpace();
    setDraftName("New Space");
    setEditingSpaceId(newSpaceId);
  };

  const pinnedTabs = selectedSpace.tabs.filter((tab) => tab.pinned);
  const regularTabs = selectedSpace.tabs.filter((tab) => !tab.pinned);

  const renderTab = (tab: BrowserTab) => {
    const isActive = tab.id === selectedSpace.activeTabId;
    const canDrag = Boolean(tab.url && !tab.isStartPage);
    const canClose = selectedSpace.tabs.length > 1;
    const rowClassName = [
      "tab-row",
      isActive ? "is-selected" : "",
      draggedTabId === tab.id ? "is-dragging" : "",
      canDrag ? "" : "is-static"
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        key={tab.id}
        className={rowClassName}
        draggable={canDrag}
        onDragStart={(event) => onTabDragStart(event, tab)}
        onDragEnd={onTabDragEnd}
        onDragOver={(event) => {
          if (!draggedTabId || draggedTabId === tab.id) {
            return;
          }

          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          if (!draggedTabId || draggedTabId === tab.id) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          onReorderTabs(selectedSpace.id, draggedTabId, tab.id);
        }}
      >
        <button
          className="tab-item"
          type="button"
          title={tab.title}
          aria-current={isActive ? "page" : undefined}
          onClick={() => onSelectTab(selectedSpace.id, tab.id)}
        >
          <TabFavicon tab={tab} />
          <span className="tab-copy">
            <span>{tab.title}</span>
            <small>{getTabSubtitle(tab)}</small>
          </span>
        </button>
        <span className="tab-actions">
          {!tab.isStartPage ? (
            <button
              className="tab-action-btn"
              type="button"
              aria-label={tab.pinned ? `Unpin ${tab.title}` : `Pin ${tab.title}`}
              title={tab.pinned ? "Unpin" : "Pin"}
              onClick={(event) => {
                event.stopPropagation();
                onTogglePinTab(selectedSpace.id, tab.id);
              }}
            >
              <Icon name={tab.pinned ? "pinOff" : "pin"} size={14} />
            </button>
          ) : null}
          {canClose ? (
            <button
              className="tab-action-btn tab-close"
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onCloseTab(selectedSpace.id, tab.id);
              }}
            >
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </span>
      </div>
    );
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">A</div>
        <div className="brand-name">Andromeda</div>
      </div>

      <div className="sidebar-body">
        <section className="sidebar-section spaces-section">
          <div className="section-header">
            <span>Spaces</span>
            <button
              className="small-round-button"
              type="button"
              aria-label="Create space"
              title="New space"
              onClick={handleCreateSpace}
            >
              <Icon name="plus" size={16} />
            </button>
          </div>

          <div className="space-list">
            {spaces.map((space) => {
              const isSelected = space.id === selectedSpaceId;
              const isEditing = space.id === editingSpaceId;

              return (
                <div
                  key={space.id}
                  className={isSelected ? "space-item is-selected" : "space-item"}
                  onClick={() => !isEditing && onSelectSpace(space.id)}
                  onDoubleClick={() => beginRename(space)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (isEditing) {
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectSpace(space.id);
                    }
                  }}
                >
                  <span
                    className="space-icon"
                    style={{ "--tile-hue": space.accent } as CSSProperties}
                  >
                    <Icon name={space.icon} size={16} />
                  </span>
                  {isEditing ? (
                    <input
                      ref={renameInputRef}
                      className="space-rename"
                      value={draftName}
                      spellCheck={false}
                      onChange={(event) => setDraftName(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename();
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          setEditingSpaceId(null);
                        }
                      }}
                    />
                  ) : (
                    <span className="space-name">{space.name}</span>
                  )}
                  <span className="space-count">{space.tabs.length}</span>
                  {spaces.length > 1 ? (
                    <button
                      className="space-delete"
                      type="button"
                      aria-label={`Delete ${space.name}`}
                      title="Delete space"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteSpace(space.id);
                      }}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="sidebar-section tabs-section">
          <div className="section-header">
            <span>Tabs</span>
            <button
              className="small-round-button"
              type="button"
              aria-label="New tab"
              title="New tab"
              onClick={onNewTab}
            >
              <Icon name="plus" size={16} />
            </button>
          </div>

          {pinnedTabs.length > 0 ? (
            <>
              <div className="tab-group-label">
                <Icon name="pin" size={11} />
                <span>Pinned</span>
              </div>
              <div className="tab-list">{pinnedTabs.map(renderTab)}</div>
            </>
          ) : null}

          {regularTabs.length > 0 ? (
            <div className="tab-list">{regularTabs.map(renderTab)}</div>
          ) : null}
        </section>
      </div>
    </aside>
  );
}

export default memo(Sidebar);
