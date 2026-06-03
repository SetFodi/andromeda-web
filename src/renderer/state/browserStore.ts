import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SpaceId = "dev" | "work" | "personal";

export type BrowserTab = {
  id: string;
  title: string;
  url: string | null;
  isStartPage: boolean;
  faviconUrl?: string;
};

export type BrowserSpace = {
  id: SpaceId;
  name: string;
  count: number;
  tabs: BrowserTab[];
  activeTabId: string;
};

type BrowserState = {
  selectedSpaceId: SpaceId;
  spaces: BrowserSpace[];
};

const STORAGE_KEY = "andromeda.browserState.v2";

const DEFAULT_STATE: BrowserState = {
  selectedSpaceId: "personal",
  spaces: [
    {
      id: "dev",
      name: "Dev",
      count: 7,
      activeTabId: "dev-start",
      tabs: [{ id: "dev-start", title: "Start", url: null, isStartPage: true }]
    },
    {
      id: "work",
      name: "Work",
      count: 12,
      activeTabId: "work-start",
      tabs: [{ id: "work-start", title: "Start", url: null, isStartPage: true }]
    },
    {
      id: "personal",
      name: "Personal",
      count: 5,
      activeTabId: "personal-start",
      tabs: [{ id: "personal-start", title: "Start", url: null, isStartPage: true }]
    }
  ]
};

function createTab(url: string | null, title: string, isStartPage = false): BrowserTab {
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    url,
    isStartPage
  };
}

function createLocalStartTab(space: BrowserSpace): BrowserTab {
  const baseId = `${space.id}-start`;
  let id = baseId;
  let suffix = 1;

  while (space.tabs.some((tab) => tab.id === id)) {
    id = `${space.id}-launch-start-${suffix}`;
    suffix += 1;
  }

  return {
    id,
    title: "Start",
    url: null,
    isStartPage: true
  };
}

function isSpaceId(value: unknown): value is SpaceId {
  return value === "dev" || value === "work" || value === "personal";
}

function getTitleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Browsing";
  }
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

function sanitizeState(value: unknown): BrowserState {
  if (!value || typeof value !== "object") {
    return DEFAULT_STATE;
  }

  const candidate = value as Partial<BrowserState>;
  const selectedSpaceId = isSpaceId(candidate.selectedSpaceId)
    ? candidate.selectedSpaceId
    : DEFAULT_STATE.selectedSpaceId;

  const spaces = DEFAULT_STATE.spaces.map((defaultSpace) => {
    const persisted = Array.isArray(candidate.spaces)
      ? candidate.spaces.find((space) => space?.id === defaultSpace.id)
      : null;

    if (!persisted || !Array.isArray(persisted.tabs)) {
      return defaultSpace;
    }

    const tabs = persisted.tabs
      .filter((tab): tab is BrowserTab => {
        return Boolean(
          tab &&
            typeof tab.id === "string" &&
            typeof tab.title === "string" &&
            (typeof tab.url === "string" || tab.url === null) &&
            typeof tab.isStartPage === "boolean" &&
            (tab.faviconUrl === undefined || isSafeFaviconUrl(tab.faviconUrl))
        );
      })
      .map((tab) => ({
        ...tab,
        faviconUrl: isSafeFaviconUrl(tab.faviconUrl) ? tab.faviconUrl : undefined
      }))
      .slice(-8);

    if (tabs.length === 0) {
      return defaultSpace;
    }

    const activeTabId =
      typeof persisted.activeTabId === "string" &&
      tabs.some((tab) => tab.id === persisted.activeTabId)
        ? persisted.activeTabId
        : tabs[0].id;

    return {
      ...defaultSpace,
      tabs,
      activeTabId
    };
  });

  return {
    selectedSpaceId,
    spaces
  };
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
      return {
        ...space,
        activeTabId: localStartTab.id
      };
    }

    didChange = true;
    const startTab = createLocalStartTab(space);
    return {
      ...space,
      tabs: [startTab, ...space.tabs],
      activeTabId: startTab.id
    };
  });

  return didChange ? { ...state, spaces } : state;
}

function loadStateSnapshot(): { state: BrowserState; persistedValue: string | null } {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY);
    const state = rawValue ? sanitizeState(JSON.parse(rawValue)) : DEFAULT_STATE;

    return {
      state: selectLaunchStartPage(state),
      persistedValue: rawValue
    };
  } catch {
    return {
      state: DEFAULT_STATE,
      persistedValue: null
    };
  }
}

export function useBrowserStore() {
  const initialStateRef = useRef<{ state: BrowserState; persistedValue: string | null } | null>(null);
  if (!initialStateRef.current) {
    initialStateRef.current = loadStateSnapshot();
  }

  const [state, setState] = useState<BrowserState>(() => initialStateRef.current!.state);
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
      selectedSpace.tabs.find((tab) => tab.id === selectedSpace.activeTabId) ??
      selectedSpace.tabs[0]
    );
  }, [selectedSpace]);

  const selectSpace = useCallback((spaceId: SpaceId) => {
    setState((current) => {
      if (current.selectedSpaceId === spaceId) {
        return current;
      }

      return {
        ...current,
        selectedSpaceId: spaceId
      };
    });
  }, []);

  const openUrl = useCallback((url: string) => {
    setState((current) => ({
      ...current,
      spaces: current.spaces.map((space) => {
        if (space.id !== current.selectedSpaceId) {
          return space;
        }

        const tab = createTab(url, getTitleFromUrl(url));

        return {
          ...space,
          tabs: [...space.tabs.slice(-7), tab],
          activeTabId: tab.id
        };
      })
    }));
  }, []);

  const updateActiveUrl = useCallback((url: string) => {
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
          return {
            ...tab,
            title: getTitleFromUrl(url),
            url,
            isStartPage: false,
            faviconUrl: undefined
          };
        });

        return {
          ...space,
          tabs
        };
      });

      return didChange ? { ...current, spaces } : current;
    });
  }, []);

  const updateActiveTitle = useCallback((title: string) => {
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
          return {
            ...tab,
            title: trimmedTitle
          };
        });

        return {
          ...space,
          tabs
        };
      });

      return didChange ? { ...current, spaces } : current;
    });
  }, []);

  const updateActiveFavicon = useCallback((faviconUrl: string) => {
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
          return {
            ...tab,
            faviconUrl
          };
        });

        return {
          ...space,
          tabs
        };
      });

      return didChange ? { ...current, spaces } : current;
    });
  }, []);

  const showStartPage = useCallback(() => {
    setState((current) => ({
      ...current,
      spaces: current.spaces.map((space) => {
        if (space.id !== current.selectedSpaceId) {
          return space;
        }

        const tab = createTab(null, "Start", true);

        return {
          ...space,
          tabs: [...space.tabs.slice(-7), tab],
          activeTabId: tab.id
        };
      })
    }));
  }, []);

  return {
    state,
    selectedSpace,
    activeTab,
    selectSpace,
    openUrl,
    updateActiveUrl,
    updateActiveTitle,
    updateActiveFavicon,
    showStartPage
  };
}
