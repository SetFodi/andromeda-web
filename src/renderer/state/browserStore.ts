import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IconName } from "../components/Icon";

export type SpaceId = string;
export type BrowserPane = "main" | "split";

export type BrowserTab = {
  id: string;
  title: string;
  url: string | null;
  isStartPage: boolean;
  faviconUrl?: string;
  pinned?: boolean;
};

export type BrowserSpace = {
  id: string;
  name: string;
  icon: IconName;
  accent: string;
  tabs: BrowserTab[];
  activeTabId: string;
};

type BrowserState = {
  selectedSpaceId: SpaceId;
  spaces: BrowserSpace[];
};

type SplitState = {
  activePane: BrowserPane;
  isSplitOpen: boolean;
  splitUrl: string | null;
  splitTitle: string;
  splitFaviconUrl?: string;
};

const STORAGE_KEY = "andromeda.browserState.v3";
const MAX_TABS_PER_SPACE = 14;

export const SPACE_PRESETS: Array<{ icon: IconName; accent: string }> = [
  { icon: "globe", accent: "#4f7df4" },
  { icon: "code", accent: "#7c5cff" },
  { icon: "briefcase", accent: "#ff7a5c" },
  { icon: "user", accent: "#41a96c" },
  { icon: "sparkle", accent: "#e0567f" },
  { icon: "grid", accent: "#d98a2b" }
];

const SPACE_ICON_NAMES: IconName[] = SPACE_PRESETS.map((preset) => preset.icon);

function randomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createStartTab(): BrowserTab {
  return { id: randomId("tab"), title: "Start", url: null, isStartPage: true };
}

function createDefaultSpace(): BrowserSpace {
  const startTab = createStartTab();
  return {
    id: randomId("space"),
    name: "Home",
    icon: "globe",
    accent: "#4f7df4",
    tabs: [startTab],
    activeTabId: startTab.id
  };
}

function createDefaultState(): BrowserState {
  const space = createDefaultSpace();
  return {
    selectedSpaceId: space.id,
    spaces: [space]
  };
}

const DEFAULT_SPLIT_STATE: SplitState = {
  activePane: "main",
  isSplitOpen: false,
  splitUrl: null,
  splitTitle: "Split View"
};

function resetSplitState(current: SplitState): SplitState {
  if (
    current.activePane === DEFAULT_SPLIT_STATE.activePane &&
    current.isSplitOpen === DEFAULT_SPLIT_STATE.isSplitOpen &&
    current.splitUrl === DEFAULT_SPLIT_STATE.splitUrl &&
    current.splitTitle === DEFAULT_SPLIT_STATE.splitTitle &&
    current.splitFaviconUrl === DEFAULT_SPLIT_STATE.splitFaviconUrl
  ) {
    return current;
  }

  return DEFAULT_SPLIT_STATE;
}

function createTab(url: string | null, title: string, isStartPage = false): BrowserTab {
  return { id: randomId("tab"), title, url, isStartPage };
}

function moveTab(tabs: BrowserTab[], sourceTabId: string, targetTabId: string): BrowserTab[] | null {
  const sourceIndex = tabs.findIndex((tab) => tab.id === sourceTabId);
  const targetIndex = tabs.findIndex((tab) => tab.id === targetTabId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return null;
  }

  const nextTabs = [...tabs];
  const [movedTab] = nextTabs.splice(sourceIndex, 1);
  nextTabs.splice(targetIndex, 0, movedTab);
  return nextTabs;
}

function getTitleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Browsing";
  }
}

function getReusableUrlKey(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";
    return `${parsedUrl.protocol}//${parsedUrl.host}${pathname}${parsedUrl.search}`;
  } catch {
    return url.trim();
  }
}

function findReusableTab(tabs: BrowserTab[], url: string): BrowserTab | null {
  const targetUrlKey = getReusableUrlKey(url);
  return (
    tabs.find((tab) => Boolean(!tab.isStartPage && tab.url && getReusableUrlKey(tab.url) === targetUrlKey)) ??
    null
  );
}

function getReusableStartTab(tabs: BrowserTab[]): BrowserTab | null {
  return tabs.find((tab) => tab.isStartPage && tab.url === null) ?? null;
}

// Trims the oldest non-pinned, non-local-start tabs once a space grows past the cap.
function capSpaceTabs(tabs: BrowserTab[]): BrowserTab[] {
  if (tabs.length <= MAX_TABS_PER_SPACE) {
    return tabs;
  }

  let excess = tabs.length - MAX_TABS_PER_SPACE;
  const result: BrowserTab[] = [];
  for (const tab of tabs) {
    const isDroppable = !tab.pinned && !(tab.isStartPage && tab.url === null);
    if (excess > 0 && isDroppable) {
      excess -= 1;
      continue;
    }
    result.push(tab);
  }

  return result;
}

function isSafeFaviconUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeTab(value: unknown): BrowserTab | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const tab = value as Partial<BrowserTab>;
  if (
    typeof tab.id !== "string" ||
    typeof tab.title !== "string" ||
    (typeof tab.url !== "string" && tab.url !== null) ||
    typeof tab.isStartPage !== "boolean"
  ) {
    return null;
  }

  return {
    id: tab.id,
    title: tab.title,
    url: tab.url ?? null,
    isStartPage: tab.isStartPage,
    faviconUrl: isSafeFaviconUrl(tab.faviconUrl) ? tab.faviconUrl : undefined,
    pinned: tab.pinned === true ? true : undefined
  };
}

function sanitizeSpace(value: unknown): BrowserSpace | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const space = value as Partial<BrowserSpace>;
  if (typeof space.id !== "string" || typeof space.name !== "string" || !Array.isArray(space.tabs)) {
    return null;
  }

  const tabs = space.tabs
    .map(sanitizeTab)
    .filter((tab): tab is BrowserTab => tab !== null);

  const cappedTabs = capSpaceTabs(tabs.length > 0 ? tabs : [createStartTab()]);
  const icon = SPACE_ICON_NAMES.includes(space.icon as IconName) ? (space.icon as IconName) : "globe";
  const accent =
    typeof space.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(space.accent)
      ? space.accent
      : "#4f7df4";
  const activeTabId =
    typeof space.activeTabId === "string" && cappedTabs.some((tab) => tab.id === space.activeTabId)
      ? space.activeTabId
      : cappedTabs[0].id;

  return {
    id: space.id,
    name: space.name.trim() || "Space",
    icon,
    accent,
    tabs: cappedTabs,
    activeTabId
  };
}

function sanitizeState(value: unknown): BrowserState {
  if (!value || typeof value !== "object") {
    return createDefaultState();
  }

  const candidate = value as Partial<BrowserState>;
  const spaces = Array.isArray(candidate.spaces)
    ? candidate.spaces.map(sanitizeSpace).filter((space): space is BrowserSpace => space !== null)
    : [];

  if (spaces.length === 0) {
    return createDefaultState();
  }

  const selectedSpaceId =
    typeof candidate.selectedSpaceId === "string" &&
    spaces.some((space) => space.id === candidate.selectedSpaceId)
      ? candidate.selectedSpaceId
      : spaces[0].id;

  return { selectedSpaceId, spaces };
}

function selectLaunchStartPage(state: BrowserState): BrowserState {
  let didChange = false;
  const spaces = state.spaces.map((space) => {
    if (space.id !== state.selectedSpaceId) {
      return space;
    }

    const localStartTab = space.tabs.find((tab) => tab.isStartPage && tab.url === null);
    if (localStartTab) {
      if (space.activeTabId === localStartTab.id) {
        return space;
      }

      didChange = true;
      return { ...space, activeTabId: localStartTab.id };
    }

    didChange = true;
    const startTab = createStartTab();
    return {
      ...space,
      tabs: capSpaceTabs([startTab, ...space.tabs]),
      activeTabId: startTab.id
    };
  });

  return didChange ? { ...state, spaces } : state;
}

function loadStateSnapshot(): { state: BrowserState; persistedValue: string | null } {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY);
    const state = rawValue ? sanitizeState(JSON.parse(rawValue)) : createDefaultState();
    const launchState = selectLaunchStartPage(state);
    const serializedLaunchState = JSON.stringify(launchState);
    if (rawValue !== serializedLaunchState) {
      localStorage.setItem(STORAGE_KEY, serializedLaunchState);
    }

    return { state: launchState, persistedValue: serializedLaunchState };
  } catch {
    return { state: createDefaultState(), persistedValue: null };
  }
}

export function useBrowserStore() {
  const initialStateRef = useRef<{ state: BrowserState; persistedValue: string | null } | null>(null);
  if (!initialStateRef.current) {
    initialStateRef.current = loadStateSnapshot();
  }

  const [state, setState] = useState<BrowserState>(() => initialStateRef.current!.state);
  const [splitState, setSplitState] = useState<SplitState>(DEFAULT_SPLIT_STATE);
  const [closedTabs, setClosedTabs] = useState<Array<{ spaceId: SpaceId; tab: BrowserTab }>>([]);
  const persistedStateRef = useRef(initialStateRef.current.persistedValue ?? "");

  useEffect(() => {
    const serializedState = JSON.stringify(state);
    if (serializedState === persistedStateRef.current) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, serializedState);
    persistedStateRef.current = serializedState;
  }, [state]);

  const selectedSpace = useMemo(() => {
    return state.spaces.find((space) => space.id === state.selectedSpaceId) ?? state.spaces[0];
  }, [state.selectedSpaceId, state.spaces]);

  const activeTab = useMemo(() => {
    return (
      selectedSpace.tabs.find((tab) => tab.id === selectedSpace.activeTabId) ?? selectedSpace.tabs[0]
    );
  }, [selectedSpace]);

  const selectSpace = useCallback(
    (spaceId: SpaceId) => {
      const nextSpace = state.spaces.find((space) => space.id === spaceId);
      const nextActiveTab = nextSpace?.tabs.find((tab) => tab.id === nextSpace.activeTabId);

      setState((current) => {
        if (current.selectedSpaceId === spaceId) {
          return current;
        }

        return { ...current, selectedSpaceId: spaceId };
      });

      setSplitState((current) => {
        if (nextActiveTab?.isStartPage) {
          return resetSplitState(current);
        }

        return current.activePane === "main" ? current : { ...current, activePane: "main" };
      });
    },
    [state.spaces]
  );

  const createSpace = useCallback(() => {
    const startTab = createStartTab();
    const newSpaceId = randomId("space");

    setState((current) => {
      const preset = SPACE_PRESETS[current.spaces.length % SPACE_PRESETS.length];
      const usedNames = new Set(current.spaces.map((space) => space.name));
      let name = "New Space";
      let suffix = 2;
      while (usedNames.has(name)) {
        name = `New Space ${suffix}`;
        suffix += 1;
      }

      const newSpace: BrowserSpace = {
        id: newSpaceId,
        name,
        icon: preset.icon,
        accent: preset.accent,
        tabs: [startTab],
        activeTabId: startTab.id
      };

      return {
        selectedSpaceId: newSpaceId,
        spaces: [...current.spaces, newSpace]
      };
    });

    setSplitState(resetSplitState);
    return newSpaceId;
  }, []);

  const renameSpace = useCallback((spaceId: SpaceId, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    setState((current) => {
      let didChange = false;
      const spaces = current.spaces.map((space) => {
        if (space.id !== spaceId || space.name === trimmed) {
          return space;
        }

        didChange = true;
        return { ...space, name: trimmed };
      });

      return didChange ? { ...current, spaces } : current;
    });
  }, []);

  const updateSpace = useCallback(
    (spaceId: SpaceId, patch: { name?: string; icon?: IconName; accent?: string }) => {
      setState((current) => {
        let didChange = false;
        const spaces = current.spaces.map((space) => {
          if (space.id !== spaceId) {
            return space;
          }

          const next = { ...space };
          if (patch.name !== undefined && patch.name.trim() && patch.name.trim() !== space.name) {
            next.name = patch.name.trim();
            didChange = true;
          }
          if (patch.icon !== undefined && patch.icon !== space.icon) {
            next.icon = patch.icon;
            didChange = true;
          }
          if (
            patch.accent !== undefined &&
            /^#[0-9a-fA-F]{6}$/.test(patch.accent) &&
            patch.accent !== space.accent
          ) {
            next.accent = patch.accent;
            didChange = true;
          }

          return didChange ? next : space;
        });

        return didChange ? { ...current, spaces } : current;
      });
    },
    []
  );

  const deleteSpace = useCallback((spaceId: SpaceId) => {
    setState((current) => {
      if (current.spaces.length <= 1) {
        return current;
      }

      const removedIndex = current.spaces.findIndex((space) => space.id === spaceId);
      if (removedIndex < 0) {
        return current;
      }

      const spaces = current.spaces.filter((space) => space.id !== spaceId);
      const selectedSpaceId =
        current.selectedSpaceId === spaceId
          ? spaces[Math.max(0, removedIndex - 1)].id
          : current.selectedSpaceId;

      return { selectedSpaceId, spaces };
    });
    setSplitState(resetSplitState);
  }, []);

  const openMainUrl = useCallback((url: string) => {
    setState((current) => {
      let didChange = false;
      const spaces = current.spaces.map((space) => {
        if (space.id !== current.selectedSpaceId) {
          return space;
        }

        const reusableTab = findReusableTab(space.tabs, url);
        if (reusableTab) {
          if (space.activeTabId === reusableTab.id) {
            return space;
          }

          didChange = true;
          return { ...space, activeTabId: reusableTab.id };
        }

        // Reuse the current blank start tab instead of leaving it behind.
        const activeTab = space.tabs.find((tab) => tab.id === space.activeTabId);
        if (activeTab && activeTab.isStartPage && activeTab.url === null) {
          didChange = true;
          const tabs = space.tabs.map((tab) =>
            tab.id === activeTab.id
              ? { ...tab, url, title: getTitleFromUrl(url), isStartPage: false, faviconUrl: undefined }
              : tab
          );
          return { ...space, tabs };
        }

        didChange = true;
        const tab = createTab(url, getTitleFromUrl(url));
        const tabs = capSpaceTabs([...space.tabs, tab]);
        return { ...space, tabs, activeTabId: tab.id };
      });

      return didChange ? { ...current, spaces } : current;
    });
    setSplitState((current) => (current.activePane === "main" ? current : { ...current, activePane: "main" }));
  }, []);

  const openSplitUrl = useCallback((url: string) => {
    setSplitState((current) => {
      if (current.isSplitOpen && current.splitUrl === url) {
        return current.activePane === "split" ? current : { ...current, activePane: "split" };
      }

      return {
        activePane: "split",
        isSplitOpen: true,
        splitUrl: url,
        splitTitle: getTitleFromUrl(url)
      };
    });
  }, []);

  const openUrl = useCallback(
    (url: string) => {
      if (splitState.isSplitOpen && splitState.activePane === "split") {
        openSplitUrl(url);
        return;
      }

      openMainUrl(url);
    },
    [openMainUrl, openSplitUrl, splitState.activePane, splitState.isSplitOpen]
  );

  const selectTab = useCallback(
    (spaceId: SpaceId, tabId: string) => {
      const targetSpace = state.spaces.find((space) => space.id === spaceId);
      const targetTab = targetSpace?.tabs.find((tab) => tab.id === tabId);
      if (!targetSpace || !targetTab) {
        return;
      }

      setState((current) => {
        const currentTargetSpace = current.spaces.find((space) => space.id === spaceId);
        if (current.selectedSpaceId === spaceId && currentTargetSpace?.activeTabId === tabId) {
          return current;
        }

        return {
          ...current,
          selectedSpaceId: spaceId,
          spaces: current.spaces.map((space) =>
            space.id === spaceId ? { ...space, activeTabId: tabId } : space
          )
        };
      });

      setSplitState((current) => {
        if (targetTab.isStartPage) {
          return resetSplitState(current);
        }

        return current.activePane === "main" ? current : { ...current, activePane: "main" };
      });
    },
    [state.spaces]
  );

  const closeTab = useCallback(
    (spaceId: SpaceId, tabId: string) => {
      const targetSpace = state.spaces.find((space) => space.id === spaceId);
      if (!targetSpace?.tabs.some((tab) => tab.id === tabId)) {
        return;
      }

      const closingTab = targetSpace.tabs.find((tab) => tab.id === tabId);
      if (closingTab && closingTab.url && !closingTab.isStartPage) {
        setClosedTabs((stack) => [...stack.slice(-9), { spaceId, tab: closingTab }]);
      }

      const closingIndex = targetSpace.tabs.findIndex((tab) => tab.id === tabId);
      const remainingTabs = targetSpace.tabs.filter((tab) => tab.id !== tabId);
      const fallbackTabs = remainingTabs.length > 0 ? remainingTabs : [createStartTab()];
      const fallbackIndex = Math.max(0, Math.min(closingIndex, fallbackTabs.length - 1));
      const fallbackActiveTab =
        targetSpace.activeTabId === tabId
          ? fallbackTabs[fallbackIndex]
          : fallbackTabs.find((tab) => tab.id === targetSpace.activeTabId) ?? fallbackTabs[0];

      setState((current) => {
        let didChange = false;
        const spaces = current.spaces.map((space) => {
          if (space.id !== spaceId || !space.tabs.some((tab) => tab.id === tabId)) {
            return space;
          }

          const index = space.tabs.findIndex((tab) => tab.id === tabId);
          const remaining = space.tabs.filter((tab) => tab.id !== tabId);
          const tabs = remaining.length > 0 ? remaining : [createStartTab()];
          const nextIndex = Math.max(0, Math.min(index, tabs.length - 1));
          const activeTabId = space.activeTabId === tabId ? tabs[nextIndex].id : space.activeTabId;
          const resolvedActive = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

          didChange = true;
          return { ...space, tabs, activeTabId: resolvedActive.id };
        });

        return didChange ? { ...current, spaces } : current;
      });

      setSplitState((current) => {
        if (spaceId === state.selectedSpaceId && fallbackActiveTab.isStartPage) {
          return resetSplitState(current);
        }

        return current.activePane === "main" ? current : { ...current, activePane: "main" };
      });
    },
    [state.selectedSpaceId, state.spaces]
  );

  const duplicateTab = useCallback((spaceId: SpaceId, tabId: string) => {
    setState((current) => {
      let didChange = false;
      const spaces = current.spaces.map((space) => {
        if (space.id !== spaceId) {
          return space;
        }

        const index = space.tabs.findIndex((tab) => tab.id === tabId);
        const source = space.tabs[index];
        if (index < 0 || !source || source.isStartPage || !source.url) {
          return space;
        }

        const copy: BrowserTab = { ...source, id: randomId("tab"), pinned: undefined };
        const tabs = [...space.tabs];
        tabs.splice(index + 1, 0, copy);
        didChange = true;
        return { ...space, tabs: capSpaceTabs(tabs), activeTabId: copy.id };
      });

      return didChange ? { ...current, spaces } : current;
    });
    setSplitState((current) =>
      current.activePane === "main" ? current : { ...current, activePane: "main" }
    );
  }, []);

  const closeOtherTabs = useCallback((spaceId: SpaceId, tabId: string) => {
    setState((current) => {
      let didChange = false;
      const spaces = current.spaces.map((space) => {
        if (space.id !== spaceId) {
          return space;
        }

        const kept = space.tabs.filter((tab) => tab.id === tabId || tab.pinned);
        if (kept.length === space.tabs.length) {
          return space;
        }

        didChange = true;
        const tabs = kept.length > 0 ? kept : [createStartTab()];
        const activeTabId = tabs.some((tab) => tab.id === tabId) ? tabId : tabs[0].id;
        return { ...space, tabs, activeTabId };
      });

      return didChange ? { ...current, spaces } : current;
    });
  }, []);

  const moveTabToSpace = useCallback((fromSpaceId: SpaceId, tabId: string, toSpaceId: SpaceId) => {
    if (fromSpaceId === toSpaceId) {
      return;
    }

    setState((current) => {
      const fromSpace = current.spaces.find((space) => space.id === fromSpaceId);
      const movingTab = fromSpace?.tabs.find((tab) => tab.id === tabId);
      if (!fromSpace || !movingTab || !current.spaces.some((space) => space.id === toSpaceId)) {
        return current;
      }

      const spaces = current.spaces.map((space) => {
        if (space.id === fromSpaceId) {
          const closingIndex = space.tabs.findIndex((tab) => tab.id === tabId);
          const remaining = space.tabs.filter((tab) => tab.id !== tabId);
          const tabs = remaining.length > 0 ? remaining : [createStartTab()];
          const fallbackIndex = Math.max(0, Math.min(closingIndex, tabs.length - 1));
          const activeTabId =
            space.activeTabId === tabId ? tabs[fallbackIndex].id : space.activeTabId;
          return { ...space, tabs, activeTabId };
        }

        if (space.id === toSpaceId) {
          const tabs = capSpaceTabs([...space.tabs, movingTab]);
          return { ...space, tabs, activeTabId: movingTab.id };
        }

        return space;
      });

      return { ...current, spaces };
    });
    setSplitState((current) =>
      current.activePane === "main" ? current : { ...current, activePane: "main" }
    );
  }, []);

  const reopenClosedTab = useCallback(() => {
    if (closedTabs.length === 0) {
      return;
    }

    const entry = closedTabs[closedTabs.length - 1];
    setClosedTabs(closedTabs.slice(0, -1));

    setState((current) => {
      const targetSpaceId = current.spaces.some((space) => space.id === entry.spaceId)
        ? entry.spaceId
        : current.selectedSpaceId;
      const reopened: BrowserTab = { ...entry.tab, id: randomId("tab") };

      return {
        ...current,
        selectedSpaceId: targetSpaceId,
        spaces: current.spaces.map((space) =>
          space.id === targetSpaceId
            ? { ...space, tabs: capSpaceTabs([...space.tabs, reopened]), activeTabId: reopened.id }
            : space
        )
      };
    });
    setSplitState(resetSplitState);
  }, [closedTabs]);

  const togglePinTab = useCallback((spaceId: SpaceId, tabId: string) => {
    setState((current) => {
      let didChange = false;
      const spaces = current.spaces.map((space) => {
        if (space.id !== spaceId) {
          return space;
        }

        const tabs = space.tabs.map((tab) => {
          if (tab.id !== tabId || tab.isStartPage) {
            return tab;
          }

          didChange = true;
          return { ...tab, pinned: tab.pinned ? undefined : true };
        });

        return didChange ? { ...space, tabs } : space;
      });

      return didChange ? { ...current, spaces } : current;
    });
  }, []);

  const reorderSpaces = useCallback((sourceSpaceId: SpaceId, targetSpaceId: SpaceId) => {
    if (sourceSpaceId === targetSpaceId) {
      return;
    }

    setState((current) => {
      const sourceIndex = current.spaces.findIndex((space) => space.id === sourceSpaceId);
      const targetIndex = current.spaces.findIndex((space) => space.id === targetSpaceId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }

      const spaces = [...current.spaces];
      const [moved] = spaces.splice(sourceIndex, 1);
      spaces.splice(targetIndex, 0, moved);
      return { ...current, spaces };
    });
  }, []);

  const reorderTabs = useCallback((spaceId: SpaceId, sourceTabId: string, targetTabId: string) => {
    setState((current) => {
      let didChange = false;
      const spaces = current.spaces.map((space) => {
        if (space.id !== spaceId) {
          return space;
        }

        const tabs = moveTab(space.tabs, sourceTabId, targetTabId);
        if (!tabs) {
          return space;
        }

        didChange = true;
        return { ...space, tabs };
      });

      return didChange ? { ...current, spaces } : current;
    });
  }, []);

  const updateMainUrl = useCallback((url: string) => {
    setState((current) => {
      let didChange = false;
      const spaces = current.spaces.map((space) => {
        if (space.id !== current.selectedSpaceId) {
          return space;
        }

        const tabs = space.tabs.map((tab) => {
          if (tab.id !== space.activeTabId) {
            return tab;
          }

          if (tab.url === url && !tab.isStartPage) {
            return tab;
          }

          didChange = true;
          return { ...tab, title: getTitleFromUrl(url), url, isStartPage: false, faviconUrl: undefined };
        });

        return { ...space, tabs };
      });

      return didChange ? { ...current, spaces } : current;
    });
  }, []);

  const updateSplitUrl = useCallback((url: string) => {
    setSplitState((current) => {
      if (current.splitUrl === url && current.isSplitOpen) {
        return current;
      }

      return {
        ...current,
        activePane: "split",
        isSplitOpen: true,
        splitUrl: url,
        splitTitle: getTitleFromUrl(url),
        splitFaviconUrl: undefined
      };
    });
  }, []);

  const updateActiveUrl = useCallback(
    (url: string, pane: BrowserPane = "main") => {
      if (pane === "split") {
        updateSplitUrl(url);
        return;
      }

      updateMainUrl(url);
    },
    [updateMainUrl, updateSplitUrl]
  );

  const updateMainTitle = useCallback((title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }

    setState((current) => {
      let didChange = false;
      const spaces = current.spaces.map((space) => {
        if (space.id !== current.selectedSpaceId) {
          return space;
        }

        const tabs = space.tabs.map((tab) => {
          if (tab.id !== space.activeTabId || tab.isStartPage || tab.title === trimmedTitle) {
            return tab;
          }

          didChange = true;
          return { ...tab, title: trimmedTitle };
        });

        return { ...space, tabs };
      });

      return didChange ? { ...current, spaces } : current;
    });
  }, []);

  const updateSplitTitle = useCallback((title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }

    setSplitState((current) => {
      if (!current.isSplitOpen || current.splitTitle === trimmedTitle) {
        return current;
      }

      return { ...current, splitTitle: trimmedTitle };
    });
  }, []);

  const updateActiveTitle = useCallback(
    (title: string, pane: BrowserPane = "main") => {
      if (pane === "split") {
        updateSplitTitle(title);
        return;
      }

      updateMainTitle(title);
    },
    [updateMainTitle, updateSplitTitle]
  );

  const updateMainFavicon = useCallback((faviconUrl: string) => {
    if (!isSafeFaviconUrl(faviconUrl)) {
      return;
    }

    setState((current) => {
      let didChange = false;
      const spaces = current.spaces.map((space) => {
        if (space.id !== current.selectedSpaceId) {
          return space;
        }

        const tabs = space.tabs.map((tab) => {
          if (tab.id !== space.activeTabId || tab.isStartPage || tab.faviconUrl === faviconUrl) {
            return tab;
          }

          didChange = true;
          return { ...tab, faviconUrl };
        });

        return { ...space, tabs };
      });

      return didChange ? { ...current, spaces } : current;
    });
  }, []);

  const updateSplitFavicon = useCallback((faviconUrl: string) => {
    if (!isSafeFaviconUrl(faviconUrl)) {
      return;
    }

    setSplitState((current) => {
      if (!current.isSplitOpen || current.splitFaviconUrl === faviconUrl) {
        return current;
      }

      return { ...current, splitFaviconUrl: faviconUrl };
    });
  }, []);

  const updateActiveFavicon = useCallback(
    (faviconUrl: string, pane: BrowserPane = "main") => {
      if (pane === "split") {
        updateSplitFavicon(faviconUrl);
        return;
      }

      updateMainFavicon(faviconUrl);
    },
    [updateMainFavicon, updateSplitFavicon]
  );

  const updateTabUrl = useCallback((tabId: string, url: string) => {
    setState((current) => {
      let didChange = false;
      const spaces = current.spaces.map((space) => {
        if (!space.tabs.some((tab) => tab.id === tabId)) {
          return space;
        }

        const tabs = space.tabs.map((tab) => {
          if (tab.id !== tabId || (tab.url === url && !tab.isStartPage)) {
            return tab;
          }

          didChange = true;
          return { ...tab, url, title: getTitleFromUrl(url), isStartPage: false, faviconUrl: undefined };
        });

        return didChange ? { ...space, tabs } : space;
      });

      return didChange ? { ...current, spaces } : current;
    });
  }, []);

  const updateTabTitle = useCallback((tabId: string, title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }

    setState((current) => {
      let didChange = false;
      const spaces = current.spaces.map((space) => {
        if (!space.tabs.some((tab) => tab.id === tabId)) {
          return space;
        }

        const tabs = space.tabs.map((tab) => {
          if (tab.id !== tabId || tab.isStartPage || tab.title === trimmedTitle) {
            return tab;
          }

          didChange = true;
          return { ...tab, title: trimmedTitle };
        });

        return didChange ? { ...space, tabs } : space;
      });

      return didChange ? { ...current, spaces } : current;
    });
  }, []);

  const updateTabFavicon = useCallback((tabId: string, faviconUrl: string) => {
    if (!isSafeFaviconUrl(faviconUrl)) {
      return;
    }

    setState((current) => {
      let didChange = false;
      const spaces = current.spaces.map((space) => {
        if (!space.tabs.some((tab) => tab.id === tabId)) {
          return space;
        }

        const tabs = space.tabs.map((tab) => {
          if (tab.id !== tabId || tab.isStartPage || tab.faviconUrl === faviconUrl) {
            return tab;
          }

          didChange = true;
          return { ...tab, faviconUrl };
        });

        return didChange ? { ...space, tabs } : space;
      });

      return didChange ? { ...current, spaces } : current;
    });
  }, []);

  const selectPane = useCallback((pane: BrowserPane) => {
    setSplitState((current) => {
      if (pane === "split" && !current.isSplitOpen) {
        return current;
      }

      if (current.activePane === pane) {
        return current;
      }

      return { ...current, activePane: pane };
    });
  }, []);

  const closeSplitView = useCallback(() => {
    setSplitState(resetSplitState);
  }, []);

  const openNewTab = useCallback(() => {
    setState((current) => {
      const spaces = current.spaces.map((space) => {
        if (space.id !== current.selectedSpaceId) {
          return space;
        }

        const tab = createTab(null, "Start", true);
        const tabs = capSpaceTabs([...space.tabs, tab]);
        return { ...space, tabs, activeTabId: tab.id };
      });

      return { ...current, spaces };
    });
    setSplitState(resetSplitState);
  }, []);

  const showStartPage = useCallback(() => {
    setState((current) => {
      let didChange = false;
      const spaces = current.spaces.map((space) => {
        if (space.id !== current.selectedSpaceId) {
          return space;
        }

        const startTab = getReusableStartTab(space.tabs);
        if (startTab) {
          if (space.activeTabId === startTab.id) {
            return space;
          }

          didChange = true;
          return { ...space, activeTabId: startTab.id };
        }

        didChange = true;
        const tab = createTab(null, "Start", true);
        const tabs = capSpaceTabs([...space.tabs, tab]);
        return { ...space, tabs, activeTabId: tab.id };
      });

      return didChange ? { ...current, spaces } : current;
    });
    setSplitState(resetSplitState);
  }, []);

  return {
    state,
    selectedSpace,
    activeTab,
    activePane: splitState.activePane,
    isSplitOpen: splitState.isSplitOpen,
    splitUrl: splitState.splitUrl,
    splitTitle: splitState.splitTitle,
    splitFaviconUrl: splitState.splitFaviconUrl,
    selectSpace,
    createSpace,
    renameSpace,
    updateSpace,
    deleteSpace,
    selectPane,
    openUrl,
    openMainUrl,
    openSplitUrl,
    selectTab,
    closeTab,
    duplicateTab,
    closeOtherTabs,
    moveTabToSpace,
    reopenClosedTab,
    canReopenTab: closedTabs.length > 0,
    togglePinTab,
    reorderTabs,
    reorderSpaces,
    openNewTab,
    closeSplitView,
    updateActiveUrl,
    updateActiveTitle,
    updateActiveFavicon,
    updateTabUrl,
    updateTabTitle,
    updateTabFavicon,
    showStartPage
  };
}
