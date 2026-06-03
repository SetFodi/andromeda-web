import { memo } from "react";
import type { DragEvent } from "react";
import type { BrowserSpace, BrowserTab, SpaceId } from "../state/browserStore";
import Icon, { IconName } from "./Icon";

type SidebarProps = {
  spaces: BrowserSpace[];
  selectedSpaceId: SpaceId;
  activePinnedId: "github" | "linear" | "docs" | null;
  onSelectSpace: (spaceId: SpaceId) => void;
  onSelectTab: (spaceId: SpaceId, tabId: string) => void;
  onCloseTab: (spaceId: SpaceId, tabId: string) => void;
  onTabDragStart: (event: DragEvent<HTMLElement>, tab: BrowserTab) => void;
  onTabDragEnd: () => void;
  onNewTab: () => void;
  onOpenPinned: (target: "github" | "linear" | "docs") => void;
};

const spaceIcons: Record<SpaceId, IconName> = {
  dev: "code",
  work: "briefcase",
  personal: "user"
};

const pinnedItems: Array<{
  id: "github" | "linear" | "docs";
  label: string;
  icon: IconName;
}> = [
  { id: "github", label: "GitHub", icon: "github" },
  { id: "linear", label: "Linear", icon: "linear" },
  { id: "docs", label: "Docs", icon: "docs" }
];

function getTabSubtitle(tab: BrowserTab): string {
  if (tab.isStartPage || !tab.url) {
    return "Local start page";
  }

  try {
    return new URL(tab.url).hostname.replace(/^www\./, "");
  } catch {
    return tab.url;
  }
}

function Sidebar({
  spaces,
  selectedSpaceId,
  activePinnedId,
  onSelectSpace,
  onSelectTab,
  onCloseTab,
  onTabDragStart,
  onTabDragEnd,
  onNewTab,
  onOpenPinned
}: SidebarProps) {
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0];

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
            <button className="small-round-button" type="button" aria-label="New tab" onClick={onNewTab}>
              <Icon name="plus" size={17} />
            </button>
          </div>

          <div className="space-list">
            {spaces.map((space) => (
              <button
                key={space.id}
                className={space.id === selectedSpaceId ? "space-item is-selected" : "space-item"}
                type="button"
                onClick={() => onSelectSpace(space.id)}
              >
                <span className={`space-icon ${space.id}`}>
                  <Icon name={spaceIcons[space.id]} size={17} />
                </span>
                <span className="space-name">{space.name}</span>
                {space.id === selectedSpaceId ? <span className="selected-dot" /> : null}
                <span className="space-count">{space.tabs.length}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="sidebar-section pinned-section">
          <div className="section-header">
            <span>Pinned</span>
          </div>

          <div className="pinned-list">
            {pinnedItems.map((item) => (
              <button
                key={item.id}
                className={item.id === activePinnedId ? "pinned-item is-selected" : "pinned-item"}
                type="button"
                aria-current={item.id === activePinnedId ? "page" : undefined}
                onClick={() => onOpenPinned(item.id)}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="sidebar-section tabs-section">
          <div className="section-header">
            <span>{selectedSpace.name} tabs</span>
          </div>

          <div className="tab-list">
            {selectedSpace.tabs.map((tab) => {
              const isActive = tab.id === selectedSpace.activeTabId;
              const canDrag = Boolean(tab.url && !tab.isStartPage);

              return (
                <div
                  key={tab.id}
                  className={isActive ? "tab-row is-selected" : "tab-row"}
                  draggable={canDrag}
                  onDragStart={(event) => onTabDragStart(event, tab)}
                  onDragEnd={onTabDragEnd}
                >
                  <button
                    className="tab-item"
                    type="button"
                    title={tab.title}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => onSelectTab(selectedSpace.id, tab.id)}
                  >
                    <span className="tab-favicon">
                      {tab.faviconUrl && !tab.isStartPage ? (
                        <img alt="" src={tab.faviconUrl} />
                      ) : (
                        <Icon name={tab.isStartPage ? "docs" : "search"} size={15} />
                      )}
                    </span>
                    <span className="tab-copy">
                      <span>{tab.title}</span>
                      <small>{getTabSubtitle(tab)}</small>
                    </span>
                  </button>
                  <button
                    className="tab-close"
                    type="button"
                    aria-label={`Close ${tab.title}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseTab(selectedSpace.id, tab.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <button className="morning-card" type="button" aria-label="Daily focus">
        <span className="morning-icon">
          <Icon name="sun" size={22} />
        </span>
        <span className="morning-copy">
          <span>Good morning, Alex</span>
          <small>Have a focused day.</small>
        </span>
        <Icon className="morning-chevron" name="chevronRight" size={16} />
      </button>
    </aside>
  );
}

export default memo(Sidebar);
