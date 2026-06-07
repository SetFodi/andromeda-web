import { memo, useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent as ReactMouseEvent } from "react";
import type { BrowserSpace, BrowserTab, SpaceId } from "../state/browserStore";
import Icon, { IconName } from "./Icon";
import { getFaviconSrc } from "../utils/favicon";

const SPACE_COLORS = [
  "#ff7a5c",
  "#f4a23b",
  "#41a96c",
  "#3bb0c9",
  "#4f7df4",
  "#7c5cff",
  "#e0567f",
  "#8a8f98"
];

const SPACE_ICON_OPTIONS: IconName[] = [
  "globe",
  "code",
  "briefcase",
  "user",
  "sparkle",
  "grid",
  "docs",
  "github"
];

type SidebarProps = {
  spaces: BrowserSpace[];
  selectedSpaceId: SpaceId;
  onSelectSpace: (spaceId: SpaceId) => void;
  onCreateSpace: () => SpaceId;
  onRenameSpace: (spaceId: SpaceId, name: string) => void;
  onUpdateSpace: (spaceId: SpaceId, patch: { name?: string; icon?: IconName; accent?: string }) => void;
  onDeleteSpace: (spaceId: SpaceId) => void;
  onSelectTab: (spaceId: SpaceId, tabId: string) => void;
  onCloseTab: (spaceId: SpaceId, tabId: string) => void;
  onTogglePinTab: (spaceId: SpaceId, tabId: string) => void;
  onDuplicateTab: (spaceId: SpaceId, tabId: string) => void;
  onCloseOtherTabs: (spaceId: SpaceId, tabId: string) => void;
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
  const [failed, setFailed] = useState(false);
  const src = tab.isStartPage ? null : getFaviconSrc(tab.url, tab.faviconUrl);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span className="tab-favicon">
      {src && !failed ? (
        <img alt="" src={src} loading="lazy" onError={() => setFailed(true)} />
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
  onUpdateSpace,
  onDeleteSpace,
  onSelectTab,
  onCloseTab,
  onTogglePinTab,
  onDuplicateTab,
  onCloseOtherTabs,
  onReorderTabs,
  onTabDragStart,
  onTabDragEnd,
  draggedTabId,
  onNewTab
}: SidebarProps) {
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0];
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [tabMenu, setTabMenu] = useState<{ tab: BrowserTab; x: number; y: number } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingSpaceId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [editingSpaceId]);

  useEffect(() => {
    if (!tabMenu) {
      return;
    }

    const close = () => setTabMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTabMenu(null);
      }
    };

    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [tabMenu]);

  const openTabMenu = (event: ReactMouseEvent, tab: BrowserTab) => {
    event.preventDefault();
    const left = Math.max(8, Math.min(event.clientX, 280 - 200));
    const top = Math.min(event.clientY, window.innerHeight - 250);
    setTabMenu({ tab, x: left, y: Math.max(8, top) });
  };

  const closeTabMenu = () => setTabMenu(null);

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
        onContextMenu={(event) => openTabMenu(event, tab)}
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
                  className={
                    [
                      "space-item",
                      isSelected ? "is-selected" : "",
                      isEditing ? "is-editing" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
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
                  <span className="space-name">{space.name}</span>
                  <span className="space-count">{space.tabs.length}</span>
                  {spaces.length > 1 && !isEditing ? (
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

                  {isEditing ? (
                    <div
                      className="space-editor"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        ref={renameInputRef}
                        className="space-editor-name"
                        value={draftName}
                        spellCheck={false}
                        placeholder="Space name"
                        maxLength={28}
                        onChange={(event) => setDraftName(event.target.value)}
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
                      <div className="space-editor-label">Color</div>
                      <div className="space-editor-colors">
                        {SPACE_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={
                              color.toLowerCase() === space.accent.toLowerCase()
                                ? "space-swatch is-active"
                                : "space-swatch"
                            }
                            style={{ "--swatch": color } as CSSProperties}
                            aria-label={`Use ${color}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => onUpdateSpace(space.id, { accent: color })}
                          />
                        ))}
                      </div>
                      <div className="space-editor-label">Icon</div>
                      <div className="space-editor-icons">
                        {SPACE_ICON_OPTIONS.map((iconName) => (
                          <button
                            key={iconName}
                            type="button"
                            className={
                              iconName === space.icon ? "space-icon-pick is-active" : "space-icon-pick"
                            }
                            aria-label={`Use ${iconName} icon`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => onUpdateSpace(space.id, { icon: iconName })}
                          >
                            <Icon name={iconName} size={15} />
                          </button>
                        ))}
                      </div>
                    </div>
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

      {tabMenu ? (
        <div
          className="tab-context"
          role="menu"
          style={{ top: tabMenu.y, left: tabMenu.x }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {!tabMenu.tab.isStartPage ? (
            <button
              type="button"
              className="tab-context-item"
              role="menuitem"
              onClick={() => {
                onTogglePinTab(selectedSpace.id, tabMenu.tab.id);
                closeTabMenu();
              }}
            >
              <Icon name={tabMenu.tab.pinned ? "pinOff" : "pin"} size={15} />
              <span>{tabMenu.tab.pinned ? "Unpin tab" : "Pin tab"}</span>
            </button>
          ) : null}
          {tabMenu.tab.url && !tabMenu.tab.isStartPage ? (
            <button
              type="button"
              className="tab-context-item"
              role="menuitem"
              onClick={() => {
                onDuplicateTab(selectedSpace.id, tabMenu.tab.id);
                closeTabMenu();
              }}
            >
              <Icon name="plus" size={15} />
              <span>Duplicate tab</span>
            </button>
          ) : null}
          {tabMenu.tab.url ? (
            <button
              type="button"
              className="tab-context-item"
              role="menuitem"
              onClick={() => {
                if (tabMenu.tab.url) {
                  void navigator.clipboard?.writeText(tabMenu.tab.url);
                }
                closeTabMenu();
              }}
            >
              <Icon name="globe" size={15} />
              <span>Copy address</span>
            </button>
          ) : null}
          {selectedSpace.tabs.length > 1 ? (
            <>
              <div className="tab-context-sep" />
              <button
                type="button"
                className="tab-context-item"
                role="menuitem"
                onClick={() => {
                  onCloseTab(selectedSpace.id, tabMenu.tab.id);
                  closeTabMenu();
                }}
              >
                <Icon name="close" size={15} />
                <span>Close tab</span>
              </button>
              <button
                type="button"
                className="tab-context-item is-danger"
                role="menuitem"
                onClick={() => {
                  onCloseOtherTabs(selectedSpace.id, tabMenu.tab.id);
                  closeTabMenu();
                }}
              >
                <Icon name="close" size={15} />
                <span>Close other tabs</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

export default memo(Sidebar);
