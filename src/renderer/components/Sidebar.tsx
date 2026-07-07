import { lazy, memo, Suspense, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  WheelEvent
} from "react";
import type { BrowserSpace, BrowserTab, SpaceId } from "../state/browserStore";
import Icon, { IconName } from "./Icon";
import { TabFavicon } from "./TabFavicon";
// Lazy: the vendored HeroUI color picker is the biggest component in the
// bundle and is only needed once a space menu opens.
const SpaceColorPicker = lazy(() => import("./SpaceColorPicker"));

const DEFAULT_SPACE_COLOR = "#f28366";

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
  onMouseLeave?: () => void;
  onResizeStart?: (event: ReactMouseEvent) => void;
  onSelectSpace: (spaceId: SpaceId) => void;
  onCreateSpace: () => SpaceId;
  onRenameSpace: (spaceId: SpaceId, name: string) => void;
  onUpdateSpace: (
    spaceId: SpaceId,
    patch: { name?: string; icon?: IconName; accent?: string; colors?: string[] }
  ) => void;
  onPreviewSpaceColor: (spaceId: SpaceId, hex: string) => void;
  onDeleteSpace: (spaceId: SpaceId) => void;
  onReorderSpaces: (sourceSpaceId: SpaceId, targetSpaceId: SpaceId) => void;
  onSwitchSpace: (direction: "previous" | "next") => void;
  onSelectTab: (spaceId: SpaceId, tabId: string) => void;
  onCloseTab: (spaceId: SpaceId, tabId: string) => void;
  onTogglePinTab: (spaceId: SpaceId, tabId: string) => void;
  onDuplicateTab: (spaceId: SpaceId, tabId: string) => void;
  onCloseOtherTabs: (spaceId: SpaceId, tabId: string) => void;
  onSleepTab: (spaceId: SpaceId, tabId: string) => void;
  onMoveTabToSpace: (fromSpaceId: SpaceId, tabId: string, toSpaceId: SpaceId) => void;
  loadingTabId: string | null;
  tabAudio: Record<string, { audible: boolean; muted: boolean }>;
  onToggleMute: (tabId: string) => void;
  onReorderTabs: (spaceId: SpaceId, sourceTabId: string, targetTabId: string) => void;
  onTabDragStart: (event: DragEvent<HTMLElement>, tab: BrowserTab) => void;
  onTabDragEnd: () => void;
  draggedTabId: string | null;
  onNewTab: () => void;
  onTidyTabs: (spaceId: SpaceId) => void;
  onClearTabs: (spaceId: SpaceId) => void;
  showWindowControls?: boolean;
  onCloseWindow?: () => void;
  onMinimizeWindow?: () => void;
  onToggleMaximizeWindow?: () => void;
  addressBar?: ReactNode;
};

function Sidebar({
  spaces,
  selectedSpaceId,
  onMouseLeave,
  onResizeStart,
  onSelectSpace,
  onCreateSpace,
  onRenameSpace,
  onUpdateSpace,
  onPreviewSpaceColor,
  onDeleteSpace,
  onReorderSpaces,
  onSwitchSpace,
  onSelectTab,
  onCloseTab,
  onTogglePinTab,
  onDuplicateTab,
  onCloseOtherTabs,
  onSleepTab,
  onMoveTabToSpace,
  loadingTabId,
  tabAudio,
  onToggleMute,
  onReorderTabs,
  onTabDragStart,
  onTabDragEnd,
  draggedTabId,
  onNewTab,
  onTidyTabs,
  onClearTabs,
  showWindowControls,
  onCloseWindow,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  addressBar
}: SidebarProps) {
  // Global "background glow" preference — toggles the warm start-page aurora.
  // Persisted and applied as a class on <html> (also bootstrapped in main.tsx).
  const [startGlowOff, setStartGlowOff] = useState<boolean>(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("no-start-glow")
  );
  const toggleStartGlow = () => {
    setStartGlowOff((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("no-start-glow", next);
      try {
        localStorage.setItem("andromeda.startGlow", next ? "off" : "on");
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0];
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [tabMenu, setTabMenu] = useState<{ tab: BrowserTab; x: number; y: number } | null>(null);
  const [spaceMenu, setSpaceMenu] = useState<{ spaceId: SpaceId; x: number; y: number } | null>(null);
  const [dropSpaceId, setDropSpaceId] = useState<string | null>(null);
  const [draggedSpaceId, setDraggedSpaceId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [headerRename, setHeaderRename] = useState<string | null>(null);
  const headerRenameRef = useRef<HTMLInputElement>(null);
  const swipeLockRef = useRef(false);
  const swipeIdleRef = useRef<number | null>(null);
  const swipeDeltaRef = useRef(0);
  const swipeLastAtRef = useRef(0);

  useEffect(() => {
    if (!draggedTabId) {
      setDropSpaceId(null);
    }
  }, [draggedTabId]);

  useEffect(() => {
    if (editingSpaceId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [editingSpaceId]);

  const isHeaderRenaming = headerRename !== null;
  useEffect(() => {
    if (isHeaderRenaming) {
      headerRenameRef.current?.focus();
      headerRenameRef.current?.select();
    }
  }, [isHeaderRenaming]);

  // Cancel an in-flight header rename when the active Space changes.
  useEffect(() => {
    setHeaderRename(null);
  }, [selectedSpaceId]);

  useEffect(() => {
    if (!tabMenu && !spaceMenu) {
      return;
    }

    const close = () => {
      setTabMenu(null);
      setSpaceMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTabMenu(null);
        setSpaceMenu(null);
      }
    };

    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [spaceMenu, tabMenu]);

  useEffect(() => {
    return () => {
      if (swipeIdleRef.current !== null) {
        window.clearTimeout(swipeIdleRef.current);
      }
    };
  }, []);

  const openTabMenu = (event: ReactMouseEvent, tab: BrowserTab) => {
    event.preventDefault();
    event.stopPropagation();
    const left = Math.max(8, Math.min(event.clientX, 280 - 200));
    const top = Math.min(event.clientY, window.innerHeight - 250);
    setSpaceMenu(null);
    setTabMenu({ tab, x: left, y: Math.max(8, top) });
  };

  const closeTabMenu = () => setTabMenu(null);

  const openSpaceMenu = (event: ReactMouseEvent, space: BrowserSpace) => {
    event.preventDefault();
    event.stopPropagation();
    // Keep the tall color-picker menu fully on-screen: pin it within the sidebar
    // width and let it grow upward when opened from a space near the bottom.
    const MENU_WIDTH = 256;
    const MENU_HEIGHT = 504;
    const margin = 10;
    const left = Math.max(margin, Math.min(event.clientX, 286 - MENU_WIDTH - margin));
    const top = Math.max(margin, Math.min(event.clientY, window.innerHeight - MENU_HEIGHT - margin));
    setTabMenu(null);
    setSpaceMenu({ spaceId: space.id, x: left, y: top });
  };

  const closeSpaceMenu = () => setSpaceMenu(null);

  const beginRename = (space: BrowserSpace) => {
    setDraftName(space.name);
    setSpaceMenu(null);
    setEditingSpaceId(space.id);
  };

  const commitRename = () => {
    if (editingSpaceId) {
      onRenameSpace(editingSpaceId, draftName);
    }
    setEditingSpaceId(null);
  };

  const commitHeaderRename = () => {
    if (headerRename !== null) {
      const trimmed = headerRename.trim();
      if (trimmed) {
        onRenameSpace(selectedSpace.id, trimmed);
      }
    }
    setHeaderRename(null);
  };

  const handleCreateSpace = () => {
    setSpaceMenu(null);
    const newSpaceId = onCreateSpace();
    setDraftName("New Space");
    setEditingSpaceId(newSpaceId);
  };

  const pinnedTabs = selectedSpace.tabs.filter((tab) => tab.pinned);
  const activeTabs = selectedSpace.tabs.filter((tab) => !tab.pinned && !tab.isSleeping);
  const sleepingTabs = selectedSpace.tabs.filter((tab) => !tab.pinned && tab.isSleeping);

  const releaseSwipeAfterIdle = () => {
    if (swipeIdleRef.current !== null) {
      window.clearTimeout(swipeIdleRef.current);
    }
    swipeIdleRef.current = window.setTimeout(() => {
      swipeIdleRef.current = null;
      swipeLockRef.current = false;
      swipeDeltaRef.current = 0;
    }, 220);
  };

  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    if (spaces.length < 2) {
      return;
    }

    const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerWidth : 1;
    const deltaX = event.deltaX * deltaScale;
    const deltaY = event.deltaY * deltaScale;
    const horizontalIntent =
      Math.abs(deltaX) > 2 && Math.abs(deltaX) > Math.abs(deltaY) * 0.85;

    if (!horizontalIntent) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const now = window.performance.now();
    if (now - swipeLastAtRef.current > 180) {
      swipeDeltaRef.current = 0;
    }
    swipeLastAtRef.current = now;
    swipeDeltaRef.current += deltaX;
    releaseSwipeAfterIdle();

    if (swipeLockRef.current || Math.abs(swipeDeltaRef.current) < 56) {
      return;
    }

    const currentIndex = spaces.findIndex((space) => space.id === selectedSpaceId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const direction = swipeDeltaRef.current > 0 ? "next" : "previous";
    const nextIndex = Math.max(
      0,
      Math.min(spaces.length - 1, safeIndex + (direction === "next" ? 1 : -1))
    );

    swipeDeltaRef.current = 0;
    if (nextIndex === safeIndex) {
      return;
    }

    swipeLockRef.current = true;
    onSwitchSpace(direction);
  };

  const handleSidebarContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (
      target.closest(".tab-row, .space-dock-item, .space-dock-add, .space-editor, .tab-context")
    ) {
      return;
    }

    openSpaceMenu(event, selectedSpace);
  };

  const renderSpaceEditor = (space: BrowserSpace) => (
    <div className="space-editor" onClick={(event) => event.stopPropagation()}>
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
            className={iconName === space.icon ? "space-icon-pick is-active" : "space-icon-pick"}
            aria-label={`Use ${iconName} icon`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onUpdateSpace(space.id, { icon: iconName })}
          >
            <Icon name={iconName} size={15} />
          </button>
        ))}
      </div>
      {spaces.length > 1 ? (
        <button
          type="button"
          className="space-editor-delete"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onDeleteSpace(space.id);
            setEditingSpaceId(null);
          }}
        >
          <Icon name="trash" size={14} />
          <span>Delete space</span>
        </button>
      ) : null}
    </div>
  );

  const handleSpaceDragOver = (event: DragEvent<HTMLElement>, spaceId: string) => {
    const isSpaceDrag = draggedSpaceId && draggedSpaceId !== spaceId;
    const isTabDrag = draggedTabId && spaceId !== selectedSpaceId;
    if (!isSpaceDrag && !isTabDrag) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropSpaceId !== spaceId) {
      setDropSpaceId(spaceId);
    }
  };

  const handleSpaceDrop = (event: DragEvent<HTMLElement>, spaceId: string) => {
    if (draggedSpaceId && draggedSpaceId !== spaceId) {
      event.preventDefault();
      event.stopPropagation();
      onReorderSpaces(draggedSpaceId, spaceId);
    } else if (draggedTabId && spaceId !== selectedSpaceId) {
      event.preventDefault();
      event.stopPropagation();
      onMoveTabToSpace(selectedSpaceId, draggedTabId, spaceId);
    }
    setDropSpaceId(null);
    setDraggedSpaceId(null);
  };

  const renderTab = (tab: BrowserTab) => {
    const isActive = tab.id === selectedSpace.activeTabId;
    const canDrag = Boolean(tab.url && !tab.isStartPage);
    const canClose = selectedSpace.tabs.length > 1;
    const audio = tabAudio[tab.id];
    const rowClassName = [
      "tab-row",
      isActive ? "is-selected" : "",
      draggedTabId === tab.id ? "is-dragging" : "",
      tab.isSleeping ? "is-sleeping" : "",
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
        onAuxClick={(event) => {
          if (event.button === 1 && canClose) {
            event.preventDefault();
            onCloseTab(selectedSpace.id, tab.id);
          }
        }}
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
          <TabFavicon tab={tab} isLoading={tab.id === loadingTabId} />
          <span className="tab-copy">
            <span>{tab.title}</span>
          </span>
        </button>
        <span className="tab-actions">
          {audio && (audio.audible || audio.muted) ? (
            <button
              className={audio.muted ? "tab-action-btn tab-audio-btn is-muted" : "tab-action-btn tab-audio-btn"}
              type="button"
              aria-label={audio.muted ? `Unmute ${tab.title}` : `Mute ${tab.title}`}
              title={audio.muted ? "Unmute tab" : "Mute tab"}
              onClick={(event) => {
                event.stopPropagation();
                onToggleMute(tab.id);
              }}
            >
              <Icon name={audio.muted ? "volumeMute" : "volume"} size={14} />
            </button>
          ) : null}
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

  const menuSpace = spaceMenu ? spaces.find((space) => space.id === spaceMenu.spaceId) ?? null : null;

  return (
    <aside
      className="sidebar"
      onWheel={handleWheel}
      onContextMenu={handleSidebarContextMenu}
      onMouseLeave={onMouseLeave}
    >
      {onResizeStart ? (
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize"
          onMouseDown={onResizeStart}
        />
      ) : null}
      {showWindowControls ? (
        <div className="sidebar-lights" aria-label="Window controls">
          <button
            className="traffic traffic-close"
            type="button"
            aria-label="Close window"
            onClick={() => onCloseWindow?.()}
          />
          <button
            className="traffic traffic-minimize"
            type="button"
            aria-label="Minimize window"
            onClick={() => onMinimizeWindow?.()}
          />
          <button
            className="traffic traffic-maximize"
            type="button"
            aria-label="Zoom window"
            onClick={() => onToggleMaximizeWindow?.()}
          />
        </div>
      ) : null}
      {addressBar ? <div className="sidebar-address-section">{addressBar}</div> : null}
      <div className="sidebar-body">
        <div className="sidebar-space-heading">
          <span
            className="sidebar-space-icon"
            style={{ "--space-hue": selectedSpace.accent } as CSSProperties}
            aria-hidden="true"
          >
            <Icon name={selectedSpace.icon} size={15} />
          </span>
          {headerRename !== null ? (
            <input
              ref={headerRenameRef}
              className="sidebar-space-rename"
              value={headerRename}
              spellCheck={false}
              aria-label="Rename space"
              onChange={(event) => setHeaderRename(event.target.value)}
              onBlur={commitHeaderRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitHeaderRename();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setHeaderRename(null);
                }
              }}
            />
          ) : (
            <span
              className="sidebar-space-name"
              title="Double-click to rename"
              onDoubleClick={() => setHeaderRename(selectedSpace.name)}
            >
              {selectedSpace.name}
            </span>
          )}
          <button
            type="button"
            className="sidebar-space-chevron"
            aria-label={`${selectedSpace.name} space options`}
            title="Space options"
            onClick={(event) => openSpaceMenu(event, selectedSpace)}
          >
            <Icon name="chevronDown" size={16} />
          </button>
        </div>
        <div className="sidebar-rule" aria-hidden="true" />

        <section className="sidebar-section tabs-section" aria-label={`${selectedSpace.name} tabs`}>
          {pinnedTabs.length > 0 ? (
            <>
              <div className="tab-group-label">
                <Icon name="pin" size={11} />
                <span>Pinned</span>
              </div>
              <div className="tab-list">{pinnedTabs.map(renderTab)}</div>
            </>
          ) : null}

          {activeTabs.length > 0 ? (
            <>
              <div className="tab-group-label">
                <span>Tabs</span>
                <span className="tab-group-actions">
                  <button
                    type="button"
                    className="tab-group-action is-text"
                    title="Group tabs by site and close duplicates"
                    onClick={() => onTidyTabs(selectedSpace.id)}
                  >
                    Tidy
                  </button>
                  <button
                    type="button"
                    className="tab-group-action is-text"
                    title="Close all unpinned tabs (reopen with ⌘⇧T)"
                    onClick={() => onClearTabs(selectedSpace.id)}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="tab-group-action"
                    aria-label="New tab"
                    title="New tab (⌘T)"
                    onClick={onNewTab}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                </span>
              </div>
              <div className="tab-list">{activeTabs.map(renderTab)}</div>
            </>
          ) : null}

          {sleepingTabs.length > 0 ? (
            <>
              <div className="tab-group-label">
                <Icon name="moon" size={11} />
                <span>Sleeping</span>
                <span className="tab-group-count">{sleepingTabs.length}</span>
              </div>
              <div className="tab-list">{sleepingTabs.map(renderTab)}</div>
            </>
          ) : null}
        </section>
      </div>

      <nav className="space-dock" aria-label="Spaces">
        <span className="space-dock-spacer" aria-hidden="true" />
        <div className="space-dock-items">
          {spaces.map((space) => {
            const isSelected = space.id === selectedSpaceId;
            const isEditing = space.id === editingSpaceId;

            return (
              <div
                key={space.id}
                className={[
                  "space-dock-item",
                  isSelected ? "is-selected" : "",
                  isEditing ? "is-editing" : "",
                  dropSpaceId === space.id ? "is-drop-target" : "",
                  draggedSpaceId === space.id ? "is-dragging" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ "--tile-hue": space.accent } as CSSProperties}
                title={`${space.name} (${space.tabs.length} ${space.tabs.length === 1 ? "tab" : "tabs"})`}
                draggable={!isEditing}
                onClick={() => !isEditing && onSelectSpace(space.id)}
                onContextMenu={(event) => openSpaceMenu(event, space)}
                onDoubleClick={() => beginRename(space)}
                onDragStart={(event) => {
                  if (isEditing) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-andromeda-space", space.id);
                  setDraggedSpaceId(space.id);
                }}
                onDragEnd={() => {
                  setDraggedSpaceId(null);
                  setDropSpaceId(null);
                }}
                onDragOver={(event) => handleSpaceDragOver(event, space.id)}
                onDragLeave={(event) => {
                  const next = event.relatedTarget;
                  if (next instanceof Node && event.currentTarget.contains(next)) {
                    return;
                  }
                  setDropSpaceId((current) => (current === space.id ? null : current));
                }}
                onDrop={(event) => handleSpaceDrop(event, space.id)}
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
                <Icon name={space.icon} size={17} />
                {isEditing ? renderSpaceEditor(space) : null}
              </div>
            );
          })}
        </div>
        <button
          className="space-dock-add"
          type="button"
          aria-label="Create space"
          title="New space"
          onClick={handleCreateSpace}
        >
          <Icon name="plus" size={22} />
        </button>
      </nav>

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
          {tabMenu.tab.url && !tabMenu.tab.isStartPage ? (
            <button
              type="button"
              className="tab-context-item"
              role="menuitem"
              onClick={() => {
                if (tabMenu.tab.isSleeping) {
                  onSelectTab(selectedSpace.id, tabMenu.tab.id);
                } else {
                  onSleepTab(selectedSpace.id, tabMenu.tab.id);
                }
                closeTabMenu();
              }}
            >
              <Icon name={tabMenu.tab.isSleeping ? "reload" : "moon"} size={15} />
              <span>{tabMenu.tab.isSleeping ? "Wake tab" : "Sleep tab"}</span>
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

      {spaceMenu && menuSpace ? (
        <div
          className="tab-context space-context"
          role="menu"
          style={{ top: spaceMenu.y, left: spaceMenu.x }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="space-context-label">Theme color</div>
          <div className="space-color-picker">
            <Suspense fallback={null}>
              <SpaceColorPicker
                key={menuSpace.id}
                defaultValue={menuSpace.colors[0]}
                swatches={SPACE_COLORS}
                onPreview={(hex) => onPreviewSpaceColor(menuSpace.id, hex)}
              />
            </Suspense>
          </div>
          <div className="tab-context-sep" />
          <button
            type="button"
            className="tab-context-item"
            role="menuitemcheckbox"
            aria-checked={!startGlowOff}
            onClick={toggleStartGlow}
          >
            <Icon name="sparkle" size={15} />
            <span>Background glow</span>
            <span className={startGlowOff ? "ctx-state" : "ctx-state is-on"}>{startGlowOff ? "Off" : "On"}</span>
          </button>
          <button
            type="button"
            className="tab-context-item"
            role="menuitem"
            onClick={() => {
              beginRename(menuSpace);
              closeSpaceMenu();
            }}
          >
            <Icon name="pencil" size={15} />
            <span>Rename space</span>
          </button>
          {menuSpace.colors.length > 1 || menuSpace.colors[0].toLowerCase() !== DEFAULT_SPACE_COLOR ? (
            <button
              type="button"
              className="tab-context-item"
              role="menuitem"
              onClick={() => {
                onUpdateSpace(menuSpace.id, { colors: [DEFAULT_SPACE_COLOR] });
                closeSpaceMenu();
              }}
            >
              <Icon name="reload" size={15} />
              <span>Reset appearance</span>
            </button>
          ) : null}
          {spaces.length > 1 ? (
            <>
              <div className="tab-context-sep" />
              <button
                type="button"
                className="tab-context-item is-danger"
                role="menuitem"
                onClick={() => {
                  onDeleteSpace(menuSpace.id);
                  closeSpaceMenu();
                }}
              >
                <Icon name="trash" size={15} />
                <span>Delete space</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

export default memo(Sidebar);
