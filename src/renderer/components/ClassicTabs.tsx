import { memo, type CSSProperties } from "react";
import type { BrowserSpace, SpaceId } from "../state/browserStore";
import Icon from "./Icon";
import { TabFavicon } from "./TabFavicon";

type ClassicTabsProps = {
  spaces: BrowserSpace[];
  selectedSpaceId: SpaceId;
  onSelectSpace: (spaceId: SpaceId) => void;
  onSelectTab: (spaceId: SpaceId, tabId: string) => void;
  onCloseTab: (spaceId: SpaceId, tabId: string) => void;
  onNewTab: () => void;
  loadingTabId: string | null;
  tabAudio: Record<string, { audible: boolean; muted: boolean }>;
  onToggleMute: (tabId: string) => void;
};

// The horizontal tab strip for the "classic" layout — a full-width row beneath
// the toolbar that replaces the sidebar's vertical tab list. Pinned tabs lead
// (favicon-only, like Chrome); a compact space switcher sits at the left when
// more than one Space exists.
function ClassicTabs({
  spaces,
  selectedSpaceId,
  onSelectSpace,
  onSelectTab,
  onCloseTab,
  onNewTab,
  loadingTabId,
  tabAudio,
  onToggleMute
}: ClassicTabsProps) {
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0];
  if (!selectedSpace) {
    return null;
  }

  const orderedTabs = [
    ...selectedSpace.tabs.filter((tab) => tab.pinned),
    ...selectedSpace.tabs.filter((tab) => !tab.pinned)
  ];
  const canClose = selectedSpace.tabs.length > 1;

  return (
    <div className="classic-tabs">
      {spaces.length > 1 ? (
        <div className="classic-spaces" role="group" aria-label="Spaces">
          {spaces.map((space) => {
            const isActive = space.id === selectedSpace.id;
            return (
              <button
                key={space.id}
                type="button"
                className={isActive ? "classic-space is-active" : "classic-space"}
                style={{ "--space-hue": space.accent } as CSSProperties}
                title={space.name}
                aria-pressed={isActive}
                onClick={() => onSelectSpace(space.id)}
              >
                <Icon name={space.icon} size={15} />
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="classic-tab-list" role="tablist" aria-label={`${selectedSpace.name} tabs`}>
        {orderedTabs.map((tab) => {
          const isActive = tab.id === selectedSpace.activeTabId;
          const audio = tabAudio[tab.id];
          const className = [
            "classic-tab",
            isActive ? "is-active" : "",
            tab.pinned ? "is-pinned" : "",
            tab.isSleeping ? "is-sleeping" : ""
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={tab.id} className={className} role="tab" aria-selected={isActive}>
              <button
                type="button"
                className="classic-tab-main"
                title={tab.title}
                onClick={() => onSelectTab(selectedSpace.id, tab.id)}
              >
                <TabFavicon tab={tab} isLoading={tab.id === loadingTabId} />
                {!tab.pinned ? <span className="classic-tab-title">{tab.title}</span> : null}
              </button>
              {audio && (audio.audible || audio.muted) ? (
                <button
                  type="button"
                  className={audio.muted ? "classic-tab-btn is-muted" : "classic-tab-btn"}
                  aria-label={audio.muted ? `Unmute ${tab.title}` : `Mute ${tab.title}`}
                  title={audio.muted ? "Unmute tab" : "Mute tab"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleMute(tab.id);
                  }}
                >
                  <Icon name={audio.muted ? "volumeMute" : "volume"} size={13} />
                </button>
              ) : null}
              {canClose ? (
                <button
                  type="button"
                  className="classic-tab-btn classic-tab-close"
                  aria-label={`Close ${tab.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(selectedSpace.id, tab.id);
                  }}
                >
                  <Icon name="close" size={13} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="classic-new-tab"
        aria-label="New tab"
        title="New tab"
        onClick={onNewTab}
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

export default memo(ClassicTabs);
