import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IconName } from "../components/Icon";
import { quarantineCorruptValue } from "../utils/storage";

export type SpaceId = string;
export type BrowserPane = "main" | "split";

export type BrowserTab = {
  id: string;
  title: string;
  url: string | null;
  isStartPage: boolean;
  faviconUrl?: string;
  pinned?: boolean;
  isSleeping?: boolean;
};

export type BrowserSpace = {
  id: string;
  name: string;
  icon: IconName;
  accent: string;
  colors: string[];
  tabs: BrowserTab[];
  activeTabId: string;
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function sanitizeColors(value: unknown, fallback: string): string[] {
  if (Array.isArray(value)) {
    const valid = value
      .filter((color): color is string => typeof color === "string" && HEX_RE.test(color))
      .slice(0, 3);
    if (valid.length > 0) {
      return valid;
    }
  }
  return [fallback];
}

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
const CLOSED_TABS_KEY = "andromeda.closedTabs.v1";
// Soft safety ceiling — high enough for daily browsing; still bounds memory.
const MAX_TABS_PER_SPACE = 80;
// Reopen stack survives restarts (⌘⇧T). Cap keeps localStorage small.
const MAX_CLOSED_TABS = 25;

type ClosedTabEntry = { spaceId: SpaceId; tab: BrowserTab };

export const SPACE_PRESETS: Array<{ icon: IconName; accent: string }> = [
  { icon: "globe", accent: "#f28366" },
  { icon: "code", accent: "#4f7df4" },
  { icon: "briefcase", accent: "#f4a23b" },
  { icon: "user", accent: "#41a96c" },
  { icon: "sparkle", accent: "#e0567f" },
  { icon: "grid", accent: "#7c5cff" }
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
    accent: "#f28366",
    colors: ["#f28366"],
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

// Soft-trim when a space grows past the ceiling. Prefer dropping unpinned
// sleeping tabs first, then other unpinned non-start tabs (oldest first).
function capSpaceTabs(tabs: BrowserTab[]): BrowserTab[] {
  if (tabs.length <= MAX_TABS_PER_SPACE) {
    return tabs;
  }

  let excess = tabs.length - MAX_TABS_PER_SPACE;
  const dropIds = new Set<string>();

  const tryDrop = (predicate: (tab: BrowserTab) => boolean) => {
    for (const tab of tabs) {
      if (excess <= 0) {
        break;
      }
      if (dropIds.has(tab.id) || !predicate(tab)) {
        continue;
      }
      dropIds.add(tab.id);
      excess -= 1;
    }
  };

  tryDrop((tab) => Boolean(tab.isSleeping) && !tab.pinned && !(tab.isStartPage && tab.url === null));
  tryDrop((tab) => !tab.pinned && !(tab.isStartPage && tab.url === null));

  if (dropIds.size === 0) {
    return tabs;
  }

  return tabs.filter((tab) => !dropIds.has(tab.id));
}

function sanitizeClosedTabEntry(value: unknown): ClosedTabEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Partial<ClosedTabEntry>;
  if (typeof entry.spaceId !== "string") {
    return null;
  }

  const tab = sanitizeTab(entry.tab);
  if (!tab || !tab.url || tab.isStartPage) {
    return null;
  }

  return {
    spaceId: entry.spaceId,
    tab: { ...tab, isSleeping: undefined, pinned: undefined }
  };
}

function loadClosedTabs(): ClosedTabEntry[] {
  let rawValue: string | null = null;
  try {
    rawValue = localStorage.getItem(CLOSED_TABS_KEY);
    if (!rawValue) {
      return [];
    }
    const parsed: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(sanitizeClosedTabEntry)
      .filter((entry): entry is ClosedTabEntry => entry !== null)
      .slice(-MAX_CLOSED_TABS);
  } catch (error) {
    quarantineCorruptValue(CLOSED_TABS_KEY, rawValue);
    console.warn("[andromeda] closed-tabs stack unreadable; backed up and reset", error);
    return [];
  }
}

function pushClosedTab(stack: ClosedTabEntry[], entry: ClosedTabEntry): ClosedTabEntry[] {
  return [...stack, entry].slice(-MAX_CLOSED_TABS);
}

function pushClosedTabs(stack: ClosedTabEntry[], entries: ClosedTabEntry[]): ClosedTabEntry[] {
  if (entries.length === 0) {
    return stack;
  }
  return [...stack, ...entries].slice(-MAX_CLOSED_TABS);
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
    pinned: tab.pinned === true ? true : undefined,
    isSleeping: tab.isSleeping === true && typeof tab.url === "string" && !tab.isStartPage ? true : undefined
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
  const fallbackAccent =
    typeof space.accent === "string" && HEX_RE.test(space.accent) ? space.accent : "#f28366";
  const colors = sanitizeColors(space.colors, fallbackAccent);
  const activeTabId =
    typeof space.activeTabId === "string" && cappedTabs.some((tab) => tab.id === space.activeTabId)
      ? space.activeTabId
      : cappedTabs[0].id;

  return {
    id: space.id,
    name: space.name.trim() || "Space",
    icon,
    accent: colors[0],
    colors,
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

function loadStateSnapshot(): { state: BrowserState; persistedValue: string | null } {
  let rawValue: string | null = null;
  try {
    rawValue = localStorage.getItem(STORAGE_KEY);
    const state = rawValue ? sanitizeState(JSON.parse(rawValue)) : createDefaultState();
    const serializedState = JSON.stringify(state);
    if (rawValue !== serializedState) {
      try {
        localStorage.setItem(STORAGE_KEY, serializedState);
      } catch {
        // Best-effort re-normalization write; the in-memory state still stands.
      }
    }

    return { state, persistedValue: serializedState };
  } catch (error) {
    // Corrupt or unreadable state: preserve the raw value for recovery instead
    // of silently destroying every space/tab, then fall back to defaults.
    quarantineCorruptValue(STORAGE_KEY, rawValue);
    console.warn("[andromeda] browser state unreadable; backed up and reset", error);
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
  const [closedTabs, setClosedTabs] = useState<ClosedTabEntry[]>(() => loadClosedTabs());
  const persistedStateRef = useRef(initialStateRef.current.persistedValue ?? "");
  const persistedClosedRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  const closedTabsRef = useRef(closedTabs);
  stateRef.current = state;
  closedTabsRef.current = closedTabs;

  const persistState = useCallback(() => {
    const serializedState = JSON.stringify(stateRef.current);
    if (serializedState === persistedStateRef.current) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, serializedState);
      persistedStateRef.current = serializedState;
    } catch (error) {
      // Quota exceeded or storage unavailable. Leave persistedStateRef untouched
      // so the next debounced flush retries instead of assuming this write landed.
      console.warn("[andromeda] failed to persist browser state", error);
    }
  }, []);

  const persistClosedTabs = useCallback(() => {
    const serialized = JSON.stringify(closedTabsRef.current);
    if (serialized === persistedClosedRef.current) {
      return;
    }
    try {
      localStorage.setItem(CLOSED_TABS_KEY, serialized);
      persistedClosedRef.current = serialized;
    } catch (error) {
      console.warn("[andromeda] failed to persist closed tabs", error);
    }
  }, []);

  // Debounce persistence: a page load fires a burst of tab mutations (title,
  // favicon, nav state). Serializing every tab to disk on each one is wasted
  // main-thread work, so coalesce into one write 600ms after the last change.
  useEffect(() => {
    const timer = window.setTimeout(persistState, 600);
    return () => window.clearTimeout(timer);
  }, [state, persistState]);

  useEffect(() => {
    const timer = window.setTimeout(persistClosedTabs, 400);
    return () => window.clearTimeout(timer);
  }, [closedTabs, persistClosedTabs]);

  // Flush immediately when the window is closing or hidden so a debounced
  // change is never lost on quit / minimize / app switch.
  useEffect(() => {
    const flush = () => {
      persistState();
      persistClosedTabs();
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
  }, [persistState, persistClosedTabs]);

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
        colors: [preset.accent],
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
    (
      spaceId: SpaceId,
      patch: { name?: string; icon?: IconName; accent?: string; colors?: string[] }
    ) => {
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

          const nextColors =
            patch.colors !== undefined
              ? sanitizeColors(patch.colors, space.accent)
              : patch.accent !== undefined && HEX_RE.test(patch.accent)
                ? [patch.accent]
                : null;
          if (nextColors && nextColors.join() !== space.colors.join()) {
            next.colors = nextColors;
            next.accent = nextColors[0];
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
          if (space.activeTabId === reusableTab.id && !reusableTab.isSleeping) {
            return space;
          }

          didChange = true;
          const tabs = reusableTab.isSleeping
            ? space.tabs.map((tab) =>
                tab.id === reusableTab.id ? { ...tab, isSleeping: undefined } : tab
              )
            : space.tabs;
          return { ...space, tabs, activeTabId: reusableTab.id };
        }

        // Reuse the current blank start tab instead of leaving it behind.
        const activeTab = space.tabs.find((tab) => tab.id === space.activeTabId);
        if (activeTab && activeTab.isStartPage && activeTab.url === null) {
          didChange = true;
          const tabs = space.tabs.map((tab) =>
            tab.id === activeTab.id
              ? {
                  ...tab,
                  url,
                  title: getTitleFromUrl(url),
                  isStartPage: false,
                  faviconUrl: undefined,
                  isSleeping: undefined
                }
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
            space.id === spaceId
              ? {
                  ...space,
                  activeTabId: tabId,
                  tabs: space.tabs.map((tab) =>
                    tab.id === tabId && tab.isSleeping ? { ...tab, isSleeping: undefined } : tab
                  )
                }
              : space
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
        setClosedTabs((stack) =>
          pushClosedTab(stack, {
            spaceId,
            tab: { ...closingTab, isSleeping: undefined, pinned: undefined }
          })
        );
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

        const copy: BrowserTab = {
          ...source,
          id: randomId("tab"),
          pinned: undefined,
          isSleeping: undefined
        };
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

  const sleepTab = useCallback((spaceId: SpaceId, tabId: string) => {
    setState((current) => {
      let didChange = false;
      const spaces = current.spaces.map((space) => {
        if (space.id !== spaceId) {
          return space;
        }

        const target = space.tabs.find((tab) => tab.id === tabId);
        if (!target || target.isStartPage || !target.url || target.isSleeping) {
          return space;
        }

        didChange = true;
        const tabs = space.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, isSleeping: true } : tab
        );

        if (space.activeTabId !== tabId) {
          return { ...space, tabs };
        }

        const existingStart = getReusableStartTab(tabs);
        if (existingStart) {
          return { ...space, tabs, activeTabId: existingStart.id };
        }

        const startTab = createStartTab();
        return { ...space, tabs: [startTab, ...tabs], activeTabId: startTab.id };
      });

      return didChange ? { ...current, spaces } : current;
    });
    setSplitState(resetSplitState);
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
    setClosedTabs((stack) => {
      if (stack.length === 0) {
        return stack;
      }

      const entry = stack[stack.length - 1];
      const nextStack = stack.slice(0, -1);

      // Reopen after stack pop so a double-tap of ⌘⇧T can't re-consume the same entry.
      queueMicrotask(() => {
        setState((current) => {
          const targetSpaceId = current.spaces.some((space) => space.id === entry.spaceId)
            ? entry.spaceId
            : current.selectedSpaceId;
          const reopened: BrowserTab = {
            ...entry.tab,
            id: randomId("tab"),
            isSleeping: undefined,
            pinned: undefined
          };

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
      });

      return nextStack;
    });
  }, []);

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

          if (tab.url === url && !tab.isStartPage && !tab.isSleeping) {
            return tab;
          }

          didChange = true;
          return {
            ...tab,
            title: getTitleFromUrl(url),
            url,
            isStartPage: false,
            faviconUrl: undefined,
            isSleeping: undefined
          };
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

  // "Tidy": stack duplicate pages (keeping the active tab when it's one of the
  // copies), then group the remaining unpinned tabs by site in first-seen
  // order. Closed duplicates land on the reopen stack (⌘⇧T undoes).
  const tidyTabs = useCallback(
    (spaceId: SpaceId) => {
      const space = state.spaces.find((candidate) => candidate.id === spaceId);
      if (!space) {
        return;
      }

      const pinned = space.tabs.filter((tab) => tab.pinned);
      const unpinned = space.tabs.filter((tab) => !tab.pinned);

      const keptByKey = new Map<string, BrowserTab>();
      const duplicates: BrowserTab[] = [];
      for (const tab of unpinned) {
        const key = !tab.url || tab.isStartPage ? `tab:${tab.id}` : getReusableUrlKey(tab.url);
        const existing = keptByKey.get(key);
        if (!existing) {
          keptByKey.set(key, tab);
        } else if (tab.id === space.activeTabId) {
          duplicates.push(existing);
          keptByKey.set(key, tab);
        } else {
          duplicates.push(tab);
        }
      }

      const keptIds = new Set(Array.from(keptByKey.values(), (tab) => tab.id));
      const hostOf = (tab: BrowserTab): string => {
        if (!tab.url || tab.isStartPage) {
          return "";
        }
        try {
          return new URL(tab.url).hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      };

      const groupOrder: string[] = [];
      const groups = new Map<string, BrowserTab[]>();
      for (const tab of unpinned) {
        if (!keptIds.has(tab.id)) {
          continue;
        }
        const host = hostOf(tab);
        const bucket = groups.get(host);
        if (bucket) {
          bucket.push(tab);
        } else {
          groups.set(host, [tab]);
          groupOrder.push(host);
        }
      }

      const tidiedTabs = [...pinned, ...groupOrder.flatMap((host) => groups.get(host) ?? [])];
      const isUnchanged =
        duplicates.length === 0 &&
        tidiedTabs.length === space.tabs.length &&
        tidiedTabs.every((tab, index) => tab.id === space.tabs[index].id);
      if (isUnchanged) {
        return;
      }

      const restorable = duplicates
        .filter((tab) => tab.url && !tab.isStartPage)
        .map((tab) => ({
          spaceId,
          tab: { ...tab, isSleeping: undefined, pinned: undefined }
        }));
      if (restorable.length > 0) {
        setClosedTabs((stack) => pushClosedTabs(stack, restorable));
      }

      setState((current) => ({
        ...current,
        spaces: current.spaces.map((candidate) =>
          candidate.id === spaceId ? { ...candidate, tabs: tidiedTabs } : candidate
        )
      }));
    },
    [state.spaces]
  );

  // "Clear": close every unpinned tab in the space in one sweep. Closed pages
  // land on the reopen stack (up to its cap), so the sweep is recoverable.
  const clearUnpinnedTabs = useCallback(
    (spaceId: SpaceId) => {
      const space = state.spaces.find((candidate) => candidate.id === spaceId);
      if (!space) {
        return;
      }

      const removed = space.tabs.filter((tab) => !tab.pinned);
      const isAlreadyBare =
        removed.length === 0 || (space.tabs.length === 1 && space.tabs[0].isStartPage);
      if (isAlreadyBare) {
        return;
      }

      const restorable = removed
        .filter((tab) => tab.url && !tab.isStartPage)
        .map((tab) => ({
          spaceId,
          tab: { ...tab, isSleeping: undefined, pinned: undefined }
        }));
      if (restorable.length > 0) {
        setClosedTabs((stack) => pushClosedTabs(stack, restorable));
      }

      setState((current) => {
        let didChange = false;
        const spaces = current.spaces.map((candidate) => {
          if (candidate.id !== spaceId) {
            return candidate;
          }

          const keptTabs = candidate.tabs.filter((tab) => tab.pinned);
          const tabs = keptTabs.length > 0 ? keptTabs : [createStartTab()];
          const activeTabId = tabs.some((tab) => tab.id === candidate.activeTabId)
            ? candidate.activeTabId
            : tabs[0].id;

          didChange = true;
          return { ...candidate, tabs, activeTabId };
        });

        return didChange ? { ...current, spaces } : current;
      });

      if (spaceId === state.selectedSpaceId) {
        setSplitState(resetSplitState);
      }
    },
    [state.selectedSpaceId, state.spaces]
  );

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
    tidyTabs,
    clearUnpinnedTabs,
    sleepTab,
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
