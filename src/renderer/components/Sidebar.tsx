import { memo } from "react";
import type { BrowserSpace, SpaceId } from "../state/browserStore";
import Icon, { IconName } from "./Icon";

type SidebarProps = {
  spaces: BrowserSpace[];
  selectedSpaceId: SpaceId;
  onSelectSpace: (spaceId: SpaceId) => void;
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

function Sidebar({
  spaces,
  selectedSpaceId,
  onSelectSpace,
  onNewTab,
  onOpenPinned
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">A</div>
        <div className="brand-name">Andromeda</div>
      </div>

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
              <span className="space-count">{space.count}</span>
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
              className="pinned-item"
              type="button"
              onClick={() => onOpenPinned(item.id)}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </section>

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
