import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import CommandBar, { CommandBarItem } from "./components/CommandBar";
import FindBar from "./components/FindBar";
import SettingsPanel from "./components/SettingsPanel";
import Sidebar from "./components/Sidebar";
import StartPage from "./components/StartPage";
import Toolbar from "./components/Toolbar";
import { BrowserPane, BrowserTab, useBrowserStore, SpaceId } from "./state/browserStore";
import { useTheme } from "./state/useTheme";
import { useSettings } from "./state/useSettings";
import { getUrlDisplayValue, resolveNavigationInput } from "./utils/url";
import type { RecentSite } from "./components/StartPage";
import type { IconName } from "./components/Icon";

const SPLIT_RATIO_KEY = "andromeda.splitRatio";
const MIN_SPLIT_RATIO = 0.25;
const MAX_SPLIT_RATIO = 0.75;

const QUICK_URLS = {
  github: "https://github.com",
  linear: "https://linear.app"
};

const SPLIT_HEADER_HEIGHT = 34;
const SPLIT_GAP = 10;
const FIND_BAR_HEIGHT = 46;
const TAB_DRAG_DATA_TYPE = "application/x-andromeda-tab";

type PaneNavigationState = {
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
};

const DEFAULT_NAVIGATION_STATE: PaneNavigationState = {
  canGoBack: false,
  canGoForward: false,
  isLoading: false
};

function getDisplayOrderTabs(space: { tabs: BrowserTab[] }): BrowserTab[] {
  return [...space.tabs.filter((tab) => tab.pinned), ...space.tabs.filter((tab) => !tab.pinned)];
}

function getPageFallbackIcon(url: string | null, isStartPage: boolean): IconName {
  if (isStartPage) {
    return "docs";
  }

  if (!url) {
    return "search";
  }

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname === "github.com" || hostname.endsWith(".github.com")) {
      return "github";
    }

    if (hostname === "linear.app" || hostname.endsWith(".linear.app")) {
      return "linear";
    }
  } catch {
    return "search";
  }

  return "globe";
}

function loadSplitRatio(): number {
  try {
    const raw = Number.parseFloat(localStorage.getItem(SPLIT_RATIO_KEY) ?? "");
    if (Number.isFinite(raw)) {
      return Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, raw));
    }
  } catch {
    // ignore
  }
  return 0.5;
}

export default function App() {
  const { theme, toggleTheme, setTheme } = useTheme();
  const { settings, updateSettings } = useSettings();
  const contentRef = useRef<HTMLDivElement>(null);
  const splitRatioRef = useRef<number>(loadSplitRatio());
  const addressInputRef = useRef<HTMLInputElement>(null);
  const lastContentLayoutKeyRef = useRef<string | null>(null);
  const lastMainRequestRef = useRef<string | null>(null);
  const lastSplitRequestRef = useRef<string | null>(null);
  const lastCommandBarOpenRef = useRef(false);
  const didCompleteLaunchResetRef = useRef(false);
  const resizeFrameRef = useRef<number | null>(null);
  const [addressValue, setAddressValue] = useState("");
  const [isCommandBarOpen, setCommandBarOpen] = useState(false);
  const [commandBarMode, setCommandBarMode] = useState<"default" | "split">("default");
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isFindOpen, setFindOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [splitRatio, setSplitRatio] = useState<number>(() => splitRatioRef.current);
  const [isResizingSplit, setResizingSplit] = useState(false);
  const [draggedTab, setDraggedTab] = useState<BrowserTab | null>(null);
  const [isSplitDropTargetActive, setSplitDropTargetActive] = useState(false);
  const [splitDropSide, setSplitDropSide] = useState<BrowserPane | null>(null);
  const [navigationStates, setNavigationStates] = useState<Record<BrowserPane, PaneNavigationState>>({
    main: DEFAULT_NAVIGATION_STATE,
    split: DEFAULT_NAVIGATION_STATE
  });
  const {
    state,
    selectedSpace,
    activeTab,
    activePane,
    isSplitOpen,
    splitUrl,
    splitTitle,
    splitFaviconUrl,
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
    togglePinTab,
    reorderTabs,
    openNewTab,
    closeSplitView,
    updateActiveUrl,
    updateActiveTitle,
    updateActiveFavicon,
    showStartPage
  } = useBrowserStore();

  const showReactStartPage = activeTab.isStartPage;
  const recentSites = useMemo<RecentSite[]>(() => {
    const seen = new Set<string>();
    const sites: RecentSite[] = [];

    for (const space of state.spaces) {
      for (let index = space.tabs.length - 1; index >= 0; index -= 1) {
        const tab = space.tabs[index];
        if (tab.isStartPage || !tab.url) {
          continue;
        }

        let key: string;
        try {
          const parsed = new URL(tab.url);
          key = `${parsed.host}${parsed.pathname.replace(/\/+$/, "")}`;
        } catch {
          key = tab.url;
        }

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        sites.push({ id: tab.id, title: tab.title, url: tab.url });
      }
    }

    return sites.slice(0, 6);
  }, [state.spaces]);
  const currentPageIcon = useMemo<IconName>(() => {
    if (activePane === "split") {
      return getPageFallbackIcon(splitUrl, false);
    }

    return getPageFallbackIcon(activeTab.url, activeTab.isStartPage);
  }, [activePane, activeTab.isStartPage, activeTab.url, splitUrl]);
  const currentPageTitle = activePane === "split" ? splitTitle : activeTab.title;
  const currentPageFaviconUrl = activePane === "split" ? splitFaviconUrl : activeTab.faviconUrl;
  const activeNavigationState =
    activePane === "main" && showReactStartPage
      ? DEFAULT_NAVIGATION_STATE
      : navigationStates[activePane];

  const getContentLayout = useCallback(
    (splitOpen: boolean): ContentBounds | ContentLayout | null => {
      const content = contentRef.current;
      if (!content) {
        return null;
      }

      const rect = content.getBoundingClientRect();
      const findInset = isFindOpen ? FIND_BAR_HEIGHT : 0;
      const mainBounds: ContentBounds = {
        x: Math.round(rect.x),
        y: Math.round(rect.y + findInset),
        width: Math.round(rect.width),
        height: Math.max(0, Math.round(rect.height - findInset))
      };

      if (!splitOpen) {
        return mainBounds;
      }

      const width = Math.round(rect.width);
      const leftWidth = Math.round((width - SPLIT_GAP) * splitRatioRef.current);
      const rightWidth = Math.max(0, width - leftWidth - SPLIT_GAP);
      const y = Math.round(rect.y + SPLIT_HEADER_HEIGHT + findInset);
      const height = Math.max(0, Math.round(rect.height - SPLIT_HEADER_HEIGHT - findInset));

      return {
        main: {
          x: Math.round(rect.x),
          y,
          width: leftWidth,
          height
        },
        split: {
          x: Math.round(rect.x + leftWidth + SPLIT_GAP),
          y,
          width: rightWidth,
          height
        }
      };
    },
    [isFindOpen]
  );

  const sendContentLayout = useCallback((layout: ContentBounds | ContentLayout | null, force = false) => {
    if (!layout) {
      return;
    }

    const layoutKey = JSON.stringify(layout);
    if (!force && lastContentLayoutKeyRef.current === layoutKey) {
      return;
    }

    lastContentLayoutKeyRef.current = layoutKey;
    void window.andromeda.resizeContentView(layout);
  }, []);

  const flushContentLayout = useCallback(
    (splitOpen = isSplitOpen, force = false) => {
      sendContentLayout(getContentLayout(splitOpen), force);
    },
    [getContentLayout, isSplitOpen, sendContentLayout]
  );

  const resizeContentView = useCallback(() => {
    if (resizeFrameRef.current !== null) {
      return;
    }

    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      flushContentLayout();
    });
  }, [flushContentLayout]);

  useEffect(() => {
    resizeContentView();

    const resizeObserver = new ResizeObserver(resizeContentView);
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }

    window.addEventListener("resize", resizeContentView);

    return () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", resizeContentView);
    };
  }, [resizeContentView]);

  // Re-inset the web view when the find bar opens/closes (the DOM size of the
  // content host does not change, so the ResizeObserver won't fire on its own).
  useEffect(() => {
    flushContentLayout(isSplitOpen, true);
  }, [flushContentLayout, isFindOpen, isSplitOpen]);

  useEffect(() => {
    if (!didCompleteLaunchResetRef.current) {
      didCompleteLaunchResetRef.current = true;
      if (!showReactStartPage) {
        setAddressValue("");
        showStartPage();
        void window.andromeda.showStartPage();
        return;
      }
    }

    const contentRequestKey = `${activeTab.id}:${showReactStartPage ? "start" : "url"}`;
    if (lastMainRequestRef.current === contentRequestKey) {
      return;
    }

    lastMainRequestRef.current = contentRequestKey;

    // Navigation is keyed by active tab identity so browser-originated URL updates do not bounce back into IPC.
    if (showReactStartPage) {
      if (activePane === "main") {
        setAddressValue("");
      }
      void window.andromeda.showStartPage();
      return;
    }

    if (activeTab.url) {
      if (activePane === "main") {
        setAddressValue(getUrlDisplayValue(activeTab.url));
      }
      flushContentLayout();
      void window.andromeda.navigate(activeTab.url, "main");
    }
  }, [
    activePane,
    activeTab.id,
    activeTab.url,
    flushContentLayout,
    showReactStartPage,
    showStartPage
  ]);

  useEffect(() => {
    if (!isSplitOpen || !splitUrl) {
      lastSplitRequestRef.current = null;
      return;
    }

    const contentRequestKey = `split:${splitUrl}`;
    if (lastSplitRequestRef.current === contentRequestKey) {
      return;
    }

    lastSplitRequestRef.current = contentRequestKey;
    void window.andromeda.navigate(splitUrl, "split");
  }, [isSplitOpen, splitUrl]);

  useEffect(() => {
    return window.andromeda.onDidNavigate(({ pane, url }) => {
      if (pane === activePane) {
        setAddressValue(getUrlDisplayValue(url));
      }
      if (pane === "split") {
        lastSplitRequestRef.current = `split:${url}`;
      }
      updateActiveUrl(url, pane);
    });
  }, [activePane, updateActiveUrl]);

  useEffect(() => {
    return window.andromeda.onTitleUpdated(({ pane, title }) => {
      updateActiveTitle(title, pane);
    });
  }, [updateActiveTitle]);

  useEffect(() => {
    return window.andromeda.onFaviconUpdated(({ pane, faviconUrl }) => {
      updateActiveFavicon(faviconUrl, pane);
    });
  }, [updateActiveFavicon]);

  useEffect(() => {
    return window.andromeda.onNavigationStateUpdated((navigationState) => {
      setNavigationStates((current) => {
        const currentPaneState = current[navigationState.pane];
        if (
          currentPaneState.canGoBack === navigationState.canGoBack &&
          currentPaneState.canGoForward === navigationState.canGoForward &&
          currentPaneState.isLoading === navigationState.isLoading
        ) {
          return current;
        }

        return {
          ...current,
          [navigationState.pane]: {
            canGoBack: navigationState.canGoBack,
            canGoForward: navigationState.canGoForward,
            isLoading: navigationState.isLoading
          }
        };
      });
    });
  }, []);

  useEffect(() => {
    return window.andromeda.onPaneFocused(({ pane }) => {
      selectPane(pane);
    });
  }, [selectPane]);

  useEffect(() => {
    if (activePane === "split") {
      setAddressValue(splitUrl ? getUrlDisplayValue(splitUrl) : "");
      return;
    }

    setAddressValue(showReactStartPage || !activeTab.url ? "" : getUrlDisplayValue(activeTab.url));
  }, [activePane, activeTab.url, showReactStartPage, splitUrl]);

  useEffect(() => {
    return window.andromeda.onOpenCommandBar(() => {
      setCommandBarOpen(true);
    });
  }, []);

  // The command bar and settings modal both need the web views detached so the
  // renderer overlay is visible above the content region.
  const isContentOverlayOpen = isCommandBarOpen || isSettingsOpen;
  useEffect(() => {
    if (lastCommandBarOpenRef.current === isContentOverlayOpen) {
      return;
    }

    lastCommandBarOpenRef.current = isContentOverlayOpen;
    void window.andromeda.setCommandBarOpen(isContentOverlayOpen);
  }, [isContentOverlayOpen]);

  const navigateTo = useCallback(
    (url: string) => {
      flushContentLayout();
      openUrl(url);
      setAddressValue(getUrlDisplayValue(url));
    },
    [flushContentLayout, openUrl]
  );

  const openSplitCommandBar = useCallback(() => {
    setCommandBarMode("split");
    setCommandBarOpen(true);
  }, []);

  const navigateSplitTo = useCallback(
    (url: string) => {
      if (showReactStartPage) {
        flushContentLayout(false);
        openMainUrl(url);
        setAddressValue(getUrlDisplayValue(url));
        return undefined;
      }

      flushContentLayout(true);
      openSplitUrl(url);
      setAddressValue(getUrlDisplayValue(url));
      return undefined;
    },
    [flushContentLayout, openMainUrl, openSplitUrl, showReactStartPage]
  );

  const handleSubmitAddress = useCallback(() => {
    const url = resolveNavigationInput(addressValue);
    navigateTo(url);
  }, [addressValue, navigateTo]);

  const handleNewTab = useCallback(() => {
    openNewTab();
    setAddressValue("");
    requestAnimationFrame(() => {
      addressInputRef.current?.focus();
      addressInputRef.current?.select();
    });
  }, [openNewTab]);

  const handleSelectSpace = useCallback(
    (spaceId: SpaceId) => {
      selectSpace(spaceId);
    },
    [selectSpace]
  );

  const handleSelectSidebarTab = useCallback(
    (spaceId: SpaceId, tabId: string) => {
      selectTab(spaceId, tabId);
    },
    [selectTab]
  );

  const handleCloseSidebarTab = useCallback(
    (spaceId: SpaceId, tabId: string) => {
      closeTab(spaceId, tabId);
    },
    [closeTab]
  );

  const handleReorderSidebarTabs = useCallback(
    (spaceId: SpaceId, sourceTabId: string, targetTabId: string) => {
      reorderTabs(spaceId, sourceTabId, targetTabId);
    },
    [reorderTabs]
  );

  const handleBack = useCallback(() => {
    void window.andromeda.goBack(activePane);
  }, [activePane]);

  const handleForward = useCallback(() => {
    void window.andromeda.goForward(activePane);
  }, [activePane]);

  const handleReload = useCallback(() => {
    void window.andromeda.reload(activePane);
  }, [activePane]);

  const handleCloseWindow = useCallback(() => {
    void window.andromeda.closeWindow();
  }, []);

  const handleMinimizeWindow = useCallback(() => {
    void window.andromeda.minimizeWindow();
  }, []);

  const handleToggleMaximizeWindow = useCallback(() => {
    void window.andromeda.toggleMaximizeWindow();
  }, []);

  const handleImportChrome = useCallback(() => undefined, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((collapsed) => !collapsed);
  }, []);

  const openFind = useCallback(() => {
    setFindOpen(true);
  }, []);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    void window.andromeda.stopFind(activePane);
  }, [activePane]);

  const handleFind = useCallback(
    (query: string, options: { forward: boolean; findNext: boolean }) => {
      if (!query.trim()) {
        void window.andromeda.stopFind(activePane);
        return;
      }

      void window.andromeda.findInPage(activePane, query, options);
    },
    [activePane]
  );

  const adjustZoom = useCallback(
    (direction: "in" | "out" | "reset") => {
      void window.andromeda.setZoom(activePane, direction);
    },
    [activePane]
  );

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // Detach the web views during a divider drag so the host window keeps
  // receiving mousemove events even when the cursor passes over the page.
  const handleSplitResizeStart = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      const content = contentRef.current;
      if (!content) {
        return;
      }

      setResizingSplit(true);
      void window.andromeda.setCommandBarOpen(true);

      const onMove = (moveEvent: MouseEvent) => {
        const rect = content.getBoundingClientRect();
        const ratio = (moveEvent.clientX - rect.left - SPLIT_GAP / 2) / Math.max(1, rect.width - SPLIT_GAP);
        const clamped = Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, ratio));
        splitRatioRef.current = clamped;
        setSplitRatio(clamped);
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setResizingSplit(false);
        try {
          localStorage.setItem(SPLIT_RATIO_KEY, String(splitRatioRef.current));
        } catch {
          // ignore storage failures
        }
        flushContentLayout(true, true);
        void window.andromeda.setCommandBarOpen(isCommandBarOpen);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [flushContentLayout, isCommandBarOpen]
  );

  const handleSelectPane = useCallback(
    (pane: BrowserPane) => {
      selectPane(pane);
      void window.andromeda.setActivePane(pane);
    },
    [selectPane]
  );

  const handleCloseSplitView = useCallback(() => {
    flushContentLayout(false, true);
    closeSplitView();
    void window.andromeda.closeSplitView();
    lastSplitRequestRef.current = null;
    handleSelectPane("main");
  }, [closeSplitView, flushContentLayout, handleSelectPane]);

  const handleSidebarTabDragStart = useCallback(
    (event: DragEvent<HTMLElement>, tab: BrowserTab) => {
      if (!tab.url || tab.isStartPage) {
        event.preventDefault();
        return;
      }

      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData(TAB_DRAG_DATA_TYPE, tab.url);
      event.dataTransfer.setData("text/uri-list", tab.url);
      event.dataTransfer.setData("text/plain", tab.title);
      setDraggedTab(tab);
      setSplitDropTargetActive(false);
      setSplitDropSide(null);
      void window.andromeda.setCommandBarOpen(true);
    },
    []
  );

  const handleSidebarTabDragEnd = useCallback(() => {
    setDraggedTab(null);
    setSplitDropTargetActive(false);
    setSplitDropSide(null);
    void window.andromeda.setCommandBarOpen(isCommandBarOpen);
  }, [isCommandBarOpen]);

  const handleContentDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!draggedTab?.url) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      const rect = event.currentTarget.getBoundingClientRect();
      const nextDropSide: BrowserPane =
        isSplitOpen && event.clientX < rect.left + rect.width / 2 ? "main" : "split";
      setSplitDropTargetActive(true);
      setSplitDropSide((current) => (current === nextDropSide ? current : nextDropSide));
    },
    [draggedTab, isSplitOpen]
  );

  const handleContentDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setSplitDropTargetActive(false);
    setSplitDropSide(null);
  }, []);

  const handleContentDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!draggedTab?.url) {
        return;
      }

      event.preventDefault();
      const url = event.dataTransfer.getData(TAB_DRAG_DATA_TYPE) || draggedTab.url;
      const targetPane = isSplitOpen ? splitDropSide ?? "split" : "split";
      setDraggedTab(null);
      setSplitDropTargetActive(false);
      setSplitDropSide(null);
      if (isSplitOpen && targetPane === "main") {
        flushContentLayout(true);
        openMainUrl(url);
        setAddressValue(getUrlDisplayValue(url));
        handleSelectPane("main");
      } else {
        navigateSplitTo(url);
      }
      void window.andromeda.setCommandBarOpen(isCommandBarOpen);
    },
    [
      draggedTab,
      flushContentLayout,
      handleSelectPane,
      isCommandBarOpen,
      isSplitOpen,
      navigateSplitTo,
      openMainUrl,
      splitDropSide
    ]
  );

  const openCommandBar = useCallback(() => {
    setCommandBarMode("default");
    setCommandBarOpen(true);
  }, []);

  const closeCommandBar = useCallback(() => {
    setCommandBarOpen(false);
    setCommandBarMode("default");
  }, []);

  const handleCommandInputNavigation = useCallback(
    (input: string, target: "active" | "split") => {
      const url = resolveNavigationInput(input);
      if (target === "split") {
        return navigateSplitTo(url);
      }

      navigateTo(url);
      return undefined;
    },
    [navigateSplitTo, navigateTo]
  );

  const commandBarItems = useMemo<CommandBarItem[]>(
    () => [
      {
        id: "open-split-view",
        title: "Open Split View",
        subtitle: showReactStartPage ? "Choose a page for the right pane" : "Open a right pane",
        icon: "square",
        keywords: ["split", "side by side", "right pane"],
        run: () => {
          openSplitCommandBar();
          return { keepOpen: true };
        }
      },
      {
        id: "open-github-split",
        title: "Open GitHub in Split View",
        subtitle: "https://github.com",
        icon: "github",
        keywords: ["github.com", "split", "right pane"],
        run: () => navigateSplitTo(QUICK_URLS.github)
      },
      {
        id: "open-linear-split",
        title: "Open Linear in Split View",
        subtitle: "https://linear.app",
        icon: "linear",
        keywords: ["linear.app", "split", "right pane"],
        run: () => navigateSplitTo(QUICK_URLS.linear)
      },
      {
        id: "search-split",
        title: "Search in Split View",
        subtitle: "Use the typed query in the right pane",
        icon: "search",
        keywords: ["search", "split", "right pane"],
        run: (query) => {
          const trimmedQuery = query.trim();
          if (!trimmedQuery) {
            openSplitCommandBar();
            return { keepOpen: true };
          }

          return navigateSplitTo(resolveNavigationInput(trimmedQuery));
        }
      },
      {
        id: "new-tab",
        title: "New Tab",
        subtitle: "Open a fresh start page",
        icon: "plus",
        keywords: ["start", "home", "tab", "new"],
        run: handleNewTab
      },
      {
        id: "open-github",
        title: "Open GitHub",
        subtitle: "https://github.com",
        icon: "github",
        keywords: ["github.com", "code", "repo"],
        run: () => navigateTo(QUICK_URLS.github)
      },
      {
        id: "open-linear",
        title: "Open Linear",
        subtitle: "https://linear.app",
        icon: "linear",
        keywords: ["linear.app", "issues", "work"],
        run: () => navigateTo(QUICK_URLS.linear)
      },
      {
        id: "new-space",
        title: "Create New Space",
        subtitle: "Add a fresh workspace",
        icon: "plus",
        keywords: ["space", "workspace", "add", "create"],
        run: () => {
          createSpace();
        }
      },
      ...state.spaces
        .filter((space) => space.id !== state.selectedSpaceId)
        .map<CommandBarItem>((space) => ({
          id: `switch-space-${space.id}`,
          title: `Switch to ${space.name}`,
          subtitle: `${space.tabs.length} ${space.tabs.length === 1 ? "tab" : "tabs"}`,
          icon: space.icon,
          keywords: ["space", "switch", space.name.toLowerCase()],
          run: () => handleSelectSpace(space.id)
        })),
      {
        id: "reload-page",
        title: "Reload Page",
        subtitle: "Refresh the current page",
        icon: "reload",
        keywords: ["refresh"],
        run: () => void window.andromeda.reload(activePane)
      },
      {
        id: "go-back",
        title: "Go Back",
        subtitle: "Navigate back",
        icon: "arrowLeft",
        keywords: ["history", "previous"],
        run: () => void window.andromeda.goBack(activePane)
      },
      {
        id: "go-forward",
        title: "Go Forward",
        subtitle: "Navigate forward",
        icon: "arrowRight",
        keywords: ["history", "next"],
        run: () => void window.andromeda.goForward(activePane)
      }
    ],
    [
      activePane,
      createSpace,
      handleNewTab,
      handleSelectSpace,
      navigateSplitTo,
      navigateTo,
      openSplitCommandBar,
      showReactStartPage,
      state.selectedSpaceId,
      state.spaces
    ]
  );

  // Keyboard shortcuts (Cmd+T, Cmd+W, Cmd+1..9, etc.) are delivered from the
  // native application menu in the main process so they fire even while a web
  // page has focus. This dispatcher applies them to the React state.
  const handleShortcut = useCallback(
    (action: string) => {
      if (action.startsWith("select-tab-")) {
        const index = Number.parseInt(action.slice("select-tab-".length), 10) - 1;
        const target = getDisplayOrderTabs(selectedSpace)[index];
        if (target) {
          selectTab(selectedSpace.id, target.id);
        }
        return;
      }

      switch (action) {
        case "new-tab":
          handleNewTab();
          break;
        case "new-space":
          createSpace();
          break;
        case "close-tab":
          if (isSplitOpen && activePane === "split") {
            handleCloseSplitView();
          } else {
            closeTab(selectedSpace.id, selectedSpace.activeTabId);
          }
          break;
        case "command-bar":
          openCommandBar();
          break;
        case "focus-address":
          addressInputRef.current?.focus();
          addressInputRef.current?.select();
          break;
        case "reload":
          void window.andromeda.reload(activePane);
          break;
        case "back":
          void window.andromeda.goBack(activePane);
          break;
        case "forward":
          void window.andromeda.goForward(activePane);
          break;
        case "toggle-split":
          if (isSplitOpen) {
            handleCloseSplitView();
          } else {
            openSplitCommandBar();
          }
          break;
        case "toggle-sidebar":
          toggleSidebar();
          break;
        case "find":
          openFind();
          break;
        case "settings":
          openSettings();
          break;
        case "zoom-in":
          adjustZoom("in");
          break;
        case "zoom-out":
          adjustZoom("out");
          break;
        case "zoom-reset":
          adjustZoom("reset");
          break;
        case "select-last-tab": {
          const displayTabs = getDisplayOrderTabs(selectedSpace);
          const target = displayTabs[displayTabs.length - 1];
          if (target) {
            selectTab(selectedSpace.id, target.id);
          }
          break;
        }
        case "next-tab":
        case "previous-tab": {
          const displayTabs = getDisplayOrderTabs(selectedSpace);
          if (displayTabs.length === 0) {
            break;
          }
          const currentIndex = displayTabs.findIndex((tab) => tab.id === selectedSpace.activeTabId);
          const delta = action === "next-tab" ? 1 : -1;
          const nextIndex = (currentIndex + delta + displayTabs.length) % displayTabs.length;
          selectTab(selectedSpace.id, displayTabs[nextIndex].id);
          break;
        }
        default:
          break;
      }
    },
    [
      activePane,
      adjustZoom,
      closeTab,
      createSpace,
      handleCloseSplitView,
      handleNewTab,
      isSplitOpen,
      openCommandBar,
      openFind,
      openSettings,
      openSplitCommandBar,
      selectTab,
      selectedSpace,
      toggleSidebar
    ]
  );

  const handleShortcutRef = useRef(handleShortcut);
  useEffect(() => {
    handleShortcutRef.current = handleShortcut;
  }, [handleShortcut]);

  useEffect(() => {
    return window.andromeda.onShortcut((action) => handleShortcutRef.current(action));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isCommandBarOpen) {
        event.preventDefault();
        closeCommandBar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeCommandBar, isCommandBarOpen]);

  return (
    <div className="window-frame">
      <div
        className={isSidebarCollapsed ? "app-shell is-sidebar-collapsed" : "app-shell"}
        style={{ "--accent": selectedSpace.accent } as CSSProperties}
      >
        <Toolbar
          addressValue={addressValue}
          inputRef={addressInputRef}
          currentPageTitle={currentPageTitle}
          currentPageFaviconUrl={currentPageFaviconUrl}
          currentPageIcon={currentPageIcon}
          isStartPage={activePane === "main" && showReactStartPage}
          canGoBack={activeNavigationState.canGoBack}
          canGoForward={activeNavigationState.canGoForward}
          isLoading={activeNavigationState.isLoading}
          theme={theme}
          isSidebarCollapsed={isSidebarCollapsed}
          onAddressChange={setAddressValue}
          onSubmit={handleSubmitAddress}
          onBack={handleBack}
          onForward={handleForward}
          onReload={handleReload}
          onNewTab={handleNewTab}
          onOpenSplitView={openSplitCommandBar}
          onToggleTheme={toggleTheme}
          onToggleSidebar={toggleSidebar}
          onOpenSettings={openSettings}
          onCloseWindow={handleCloseWindow}
          onMinimizeWindow={handleMinimizeWindow}
          onToggleMaximizeWindow={handleToggleMaximizeWindow}
        />
        <Sidebar
          spaces={state.spaces}
          selectedSpaceId={state.selectedSpaceId}
          onSelectSpace={handleSelectSpace}
          onCreateSpace={createSpace}
          onRenameSpace={renameSpace}
          onUpdateSpace={updateSpace}
          onDeleteSpace={deleteSpace}
          onSelectTab={handleSelectSidebarTab}
          onCloseTab={handleCloseSidebarTab}
          onTogglePinTab={togglePinTab}
          onDuplicateTab={duplicateTab}
          onCloseOtherTabs={closeOtherTabs}
          onReorderTabs={handleReorderSidebarTabs}
          onTabDragStart={handleSidebarTabDragStart}
          onTabDragEnd={handleSidebarTabDragEnd}
          draggedTabId={draggedTab?.id ?? null}
          onNewTab={handleNewTab}
        />

        <div
          ref={contentRef}
          className={[
            "content-view-host",
            isSplitDropTargetActive ? "is-split-drop-target" : "",
            isFindOpen ? "is-finding" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          onDragOver={handleContentDragOver}
          onDragLeave={handleContentDragLeave}
          onDrop={handleContentDrop}
        >
          <FindBar isOpen={isFindOpen} onFind={handleFind} onClose={closeFind} />
          {draggedTab?.url ? (
            <div
              className={[
                "split-drop-layer",
                splitDropSide === "main" ? "is-main-target" : "",
                splitDropSide === "split" ? "is-split-target" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden="true"
            >
              <div className="split-drop-card">
                <span>
                  {showReactStartPage
                    ? "Open Page"
                    : splitDropSide === "main"
                      ? "Left Pane"
                      : "Right Pane"}
                </span>
                <small>{draggedTab.title}</small>
              </div>
            </div>
          ) : null}
          {isSplitOpen ? (
            <div
              className={isResizingSplit ? "split-view-frame is-resizing" : "split-view-frame"}
              aria-label="Split view"
              style={{
                gridTemplateColumns: `calc((100% - ${SPLIT_GAP}px) * ${splitRatio}) ${SPLIT_GAP}px minmax(0, 1fr)`
              }}
            >
              <button
                className={activePane === "main" ? "split-pane-label is-active" : "split-pane-label"}
                type="button"
                onClick={() => handleSelectPane("main")}
              >
                <span>{activeTab.title}</span>
              </button>
              <div
                className="split-divider"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize split"
                onMouseDown={handleSplitResizeStart}
                onDoubleClick={() => {
                  splitRatioRef.current = 0.5;
                  setSplitRatio(0.5);
                  flushContentLayout(true, true);
                  try {
                    localStorage.setItem(SPLIT_RATIO_KEY, "0.5");
                  } catch {
                    // ignore
                  }
                }}
              >
                <span className="split-divider-grip" aria-hidden="true" />
              </div>
              <div className="split-pane-label-wrap">
                <button
                  className={activePane === "split" ? "split-pane-label is-active" : "split-pane-label"}
                  type="button"
                  onClick={() => handleSelectPane("split")}
                >
                  <span>{splitTitle}</span>
                </button>
                <button
                  className="split-close"
                  type="button"
                  aria-label="Close split view"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCloseSplitView();
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ) : null}
          {showReactStartPage ? (
            <StartPage
              greetingName={settings.name}
              onOpenCommand={openCommandBar}
              onOpenLink={navigateTo}
              onImportChrome={handleImportChrome}
              recentSites={recentSites}
            />
          ) : null}
        </div>
        <CommandBar
          isOpen={isCommandBarOpen}
          mode={commandBarMode}
          commands={commandBarItems}
          onClose={closeCommandBar}
          onNavigateInput={handleCommandInputNavigation}
        />
        <SettingsPanel
          isOpen={isSettingsOpen}
          settings={settings}
          theme={theme}
          onUpdateSettings={updateSettings}
          onSetTheme={setTheme}
          onClose={closeSettings}
        />
      </div>
    </div>
  );
}
