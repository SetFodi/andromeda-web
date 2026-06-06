import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SpaceId = "dev" | "work" | "personal";
export type BrowserPane = "main" | "split";

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

type SplitState = {
  activePane: BrowserPane;
  isSplitOpen: boolean;
  splitUrl: string | null;
  splitTitle: string;
  splitFaviconUrl?: string;
};

const STORAGE_KEY = "andromeda.browserState.v2";

const DEFAULT_STATE: BrowserState = {
  selectedSpaceId: "personal",
  spaces: [
    {
      id: "dev",
      name: "Dev",
      count: 1,
      activeTabId: "dev-start",
      tabs: [{ id: "dev-start", title: "Start", url: null, isStartPage: true }]
    },
    {
      id: "work",
      name: "Work",
      count: 1,
      activeTabId: "work-start",
      tabs: [{ id: "work-start", title: "Start", url: null, isStartPage: true }]
    },
    {
      id: "personal",
      name: "Personal",
      count: 1,
      activeTabId: "personal-start",
      tabs: [{ id: "personal-start", title: "Start", url: null, isStartPage: true }]
    }
  ]
};

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
    tabs.find((tab) => {
      return Boolean(!tab.isStartPage && tab.url && getReusableUrlKey(tab.url) === targetUrlKey);
    }) ?? null
  );
}

function getReusableStartTab(tabs: BrowserTab[]): BrowserTab | null {
  return tabs.find((tab) => tab.isStartPage && tab.url === null) ?? null;
}

function getTabDedupeKey(tab: BrowserTab): string {
  if (tab.isStartPage && tab.url === null) {
    return "local-start";
  }

  if (tab.url) {
    return `url:${getReusableUrlKey(tab.url)}`;
  }

  return `tab:${tab.id}`;
}

function dedupeTabs(tabs: BrowserTab[], preferredTabId?: string): BrowserTab[] {
  const keyIndexes = new Map<string, number>();
  const dedupedTabs: BrowserTab[] = [];

  tabs.forEach((tab) => {
    const key = getTabDedupeKey(tab);
    const existingIndex = keyIndexes.get(key);
    if (existingIndex === undefined) {
      keyIndexes.set(key, dedupedTabs.length);
      dedupedTabs.push(tab);
      return;
    }

    const existingTab = dedupedTabs[existingIndex];
    if (tab.id === preferredTabId || existingTab.id !== preferredTabId) {
      dedupedTabs[existingIndex] = tab;
    }
  });

  return dedupedTabs;
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

    const safeTabs = persisted.tabs
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
      }));
    const tabs = dedupeTabs(
      safeTabs,
      typeof persisted.activeTabId === "string" ? persisted.activeTabId : undefined
    ).slice(-8);

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
      count: tabs.length,
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
      count: space.tabs.length + 1,
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
    const launchState = selectLaunchStartPage(state);
    const serializedLaunchState = JSON.stringify(launchState);
    if (rawValue !== serializedLaunchState) {
      localStorage.setItem(STORAGE_KEY, serializedLaunchState);
    }

    return {
      state: launchState,
      persistedValue: serializedLaunchState
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
  const [splitState, setSplitState] = useState<SplitState>(DEFAULT_SPLIT_STATE);
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
    const nextSpace = state.spaces.find((space) => space.id === spaceId);
    const nextActiveTab = nextSpace?.tabs.find((tab) => tab.id === nextSpace.activeTabId);

    setState((current) => {
      if (current.selectedSpaceId === spaceId) {
        return current;
      }

      return {
        ...current,
        selectedSpaceId: spaceId
      };
    });

    setSplitState((current) => {
      if (nextActiveTab?.isStartPage) {
        return resetSplitState(current);
      }

      return current.activePane === "main" ? current : { ...current, activePane: "main" };
    });
  }, [state.spaces]);

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
          return {
            ...space,
            activeTabId: reusableTab.id
          };
        }

        didChange = true;
        const tab = createTab(url, getTitleFromUrl(url));
        const tabs = [...space.tabs.slice(-7), tab];

        return {
          ...space,
          count: tabs.length,
          tabs,
          activeTabId: tab.id
        };
      });

      return didChange ? { ...current, spaces } : current;
    });
    setSplitState((current) => {
      return current.activePane === "main" ? current : { ...current, activePane: "main" };
    });
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

  const selectTab = useCallback((spaceId: SpaceId, tabId: string) => {
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
        spaces: current.spaces.map((space) => {
          if (space.id !== spaceId) {
            return space;
          }

          return {
            ...space,
            activeTabId: tabId
          };
        })
      };
    });

    setSplitState((current) => {
      if (targetTab.isStartPage) {
        return resetSplitState(current);
      }

      return current.activePane === "main" ? current : { ...current, activePane: "main" };
    });
  }, [state.spaces]);

  const closeTab = useCallback((spaceId: SpaceId, tabId: string) => {
    const targetSpace = state.spaces.find((space) => space.id === spaceId);
    if (!targetSpace?.tabs.some((tab) => tab.id === tabId)) {
      return;
    }

    const closingIndex = targetSpace.tabs.findIndex((tab) => tab.id === tabId);
    const remainingTabs = targetSpace.tabs.filter((tab) => tab.id !== tabId);
    const fallbackTabs = remainingTabs.length > 0 ? remainingTabs : [createLocalStartTab(targetSpace)];
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

        const closingIndex = space.tabs.findIndex((tab) => tab.id === tabId);
        const remainingTabs = space.tabs.filter((tab) => tab.id !== tabId);
        const tabs = remainingTabs.length > 0 ? remainingTabs : [createLocalStartTab(space)];
        const fallbackIndex = Math.max(0, Math.min(closingIndex, tabs.length - 1));
        const activeTabId = space.activeTabId === tabId ? tabs[fallbackIndex].id : space.activeTabId;
        const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

        didChange = true;
        return {
          ...space,
          count: tabs.length,
          tabs,
          activeTabId: activeTab.id
        };
      });

      return didChange ? { ...current, spaces } : current;
    });

    setSplitState((current) => {
      if (spaceId === state.selectedSpaceId && fallbackActiveTab.isStartPage) {
        return resetSplitState(current);
      }

      return current.activePane === "main" ? current : { ...current, activePane: "main" };
    });
  }, [state.selectedSpaceId, state.spaces]);

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
        return {
          ...space,
          tabs
        };
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
          count: tabs.length,
          tabs
        };
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
          return {
            ...tab,
            title: trimmedTitle
          };
        });

        return {
          ...space,
          count: tabs.length,
          tabs
        };
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

      return {
        ...current,
        splitTitle: trimmedTitle
      };
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
          return {
            ...tab,
            faviconUrl
          };
        });

        return {
          ...space,
          count: tabs.length,
          tabs
        };
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

      return {
        ...current,
        splitFaviconUrl: faviconUrl
      };
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

  const selectPane = useCallback((pane: BrowserPane) => {
    setSplitState((current) => {
      if (pane === "split" && !current.isSplitOpen) {
        return current;
      }

      if (current.activePane === pane) {
        return current;
      }

      return {
        ...current,
        activePane: pane
      };
    });
  }, []);

  const closeSplitView = useCallback(() => {
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
          return {
            ...space,
            activeTabId: startTab.id
          };
        }

        didChange = true;
        const tab = createTab(null, "Start", true);
        const tabs = [...space.tabs.slice(-7), tab];

        return {
          ...space,
          count: tabs.length,
          tabs,
          activeTabId: tab.id
        };
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
    selectPane,
    openUrl,
    openMainUrl,
    openSplitUrl,
    selectTab,
    closeTab,
    reorderTabs,
    closeSplitView,
    updateActiveUrl,
    updateActiveTitle,
    updateActiveFavicon,
    showStartPage
  };
}
