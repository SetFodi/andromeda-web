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
import CommandBar from "./components/CommandBar";
import DownloadsTray, { DownloadEntry } from "./components/DownloadsTray";
import SiteInfoPanel from "./components/SiteInfoPanel";
import FindBar from "./components/FindBar";
import SettingsPanel from "./components/SettingsPanel";
import Sidebar from "./components/Sidebar";
import StartPage from "./components/StartPage";
import Toolbar from "./components/Toolbar";
import { BrowserPane, BrowserTab, useBrowserStore, SpaceId } from "./state/browserStore";
import { useTheme } from "./state/useTheme";
import { useSettings } from "./state/useSettings";
import { useQuickLinks } from "./state/useQuickLinks";
import { useHistory } from "./state/useHistory";
import { getUrlDisplayValue, resolveNavigationInput } from "./utils/url";
import type { RecentSite } from "./components/StartPage";
import type { IconName } from "./components/Icon";

const SPLIT_RATIO_KEY = "andromeda.splitRatio";
const MIN_SPLIT_RATIO = 0.25;
const MAX_SPLIT_RATIO = 0.75;

const SPLIT_HEADER_HEIGHT = 34;
const SPLIT_GAP = 10;
const FIND_BAR_HEIGHT = 46;
const TOOLBAR_HEIGHT = 56;
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 460;
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

function isBlackAccent(hex: string): boolean {
  const normalized = hex.trim().toLowerCase();
  return normalized === "#000" || normalized === "#0000" || normalized === "#000000" || normalized === "#000000ff";
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
  const { theme, toggleTheme } = useTheme();
  const { settings, updateSettings } = useSettings();
  const { quickLinks, removeQuickLink, reorderQuickLink, toggleQuickLink, isQuickLink } =
    useQuickLinks();
  const { items: historyEntries, recordVisit, recordTyped, updateMeta: recordMeta } = useHistory();
  const contentRef = useRef<HTMLDivElement>(null);
  const lastMainUrlRef = useRef<string | null>(null);
  const appShellRef = useRef<HTMLDivElement>(null);
  const recolorIdleRef = useRef<number | null>(null);
  const recolorRafRef = useRef<number | null>(null);
  const pendingRecolorRef = useRef<{ spaceId: string; hex: string } | null>(null);
  const splitRatioRef = useRef<number>(loadSplitRatio());
  const addressInputRef = useRef<HTMLInputElement>(null);
  const lastContentLayoutKeyRef = useRef<string | null>(null);
  const lastMainRequestRef = useRef<string | null>(null);
  const lastSplitRequestRef = useRef<string | null>(null);
  const lastCommandBarOpenRef = useRef(false);
  const lastLayoutMetricsKeyRef = useRef<string | null>(null);
  const didCompleteLaunchResetRef = useRef(false);
  const sidebarResizeFrameRef = useRef<number | null>(null);
  const windowResizeIdleRef = useRef<number | null>(null);
  const spaceSwitchIdleRef = useRef<number | null>(null);
  const seenDownloadIdsRef = useRef<Set<string>>(new Set());
  const [addressValue, setAddressValue] = useState("");
  const [isCommandBarOpen, setCommandBarOpen] = useState(false);
  const [commandBarMode, setCommandBarMode] = useState<"default" | "split">("default");
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("andromeda.compact") === "1"
  );
  const [isSidebarPeeking, setSidebarPeeking] = useState(false);
  const [isResizingSidebar, setResizingSidebar] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = Number.parseInt(localStorage.getItem("andromeda.sidebarWidth") ?? "", 10);
    return Number.isFinite(stored) ? Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, stored)) : 286;
  });
  const sidebarWidthRef = useRef(sidebarWidth);
  const [isFindOpen, setFindOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isDownloadsOpen, setDownloadsOpen] = useState(false);
  const [isSiteInfoOpen, setSiteInfoOpen] = useState(false);
  const [downloads, setDownloads] = useState<DownloadEntry[]>([]);
  const [addressFocused, setAddressFocused] = useState(false);
  const [addressDirty, setAddressDirty] = useState(false);
  const [splitRatio, setSplitRatio] = useState<number>(() => splitRatioRef.current);
  const [isResizingSplit, setResizingSplit] = useState(false);
  const [draggedTab, setDraggedTab] = useState<BrowserTab | null>(null);
  const [isSplitDropTargetActive, setSplitDropTargetActive] = useState(false);
  const [splitDropSide, setSplitDropSide] = useState<BrowserPane | null>(null);
  const [splitNav, setSplitNav] = useState<PaneNavigationState>(DEFAULT_NAVIGATION_STATE);
  const [mainTabNav, setMainTabNav] = useState<Record<string, PaneNavigationState>>({});
  const [tabAudio, setTabAudio] = useState<Record<string, { audible: boolean; muted: boolean }>>({});
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
    sleepTab,
    moveTabToSpace,
    reopenClosedTab,
    togglePinTab,
    reorderTabs,
    reorderSpaces,
    closeSplitView,
    updateActiveUrl,
    updateActiveTitle,
    updateActiveFavicon,
    updateTabUrl,
    updateTabTitle,
    updateTabFavicon,
    showStartPage
  } = useBrowserStore();

  const showReactStartPage = activeTab.isStartPage;
  const shellColors =
    selectedSpace?.colors && selectedSpace.colors.length > 0
      ? selectedSpace.colors
      : [settings.appearanceAccent];
  const shellAccent = shellColors[0];
  const isPureBlackTheme = isBlackAccent(shellAccent);
  const shellStyle = {
    "--accent": shellAccent,
    "--grad-1": shellColors[0],
    "--grad-2": shellColors[1] ?? shellColors[0],
    "--grad-3": shellColors[2] ?? shellColors[1] ?? shellColors[0],
    "--sidebar-width": `${sidebarWidth}px`
  } as CSSProperties;
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
  const quickOpenItems = useMemo<
    Array<{
      id: string;
      title: string;
      url: string;
      faviconUrl?: string;
      visitCount?: number;
      typedCount?: number;
      lastVisited?: number;
    }>
  >(() => {
    const seen = new Set<string>();
    const items: Array<{
      id: string;
      title: string;
      url: string;
      faviconUrl?: string;
      visitCount?: number;
      typedCount?: number;
      lastVisited?: number;
    }> = [];

    const keyFor = (url: string) => {
      try {
        const parsed = new URL(url);
        return `${parsed.host}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`.toLowerCase();
      } catch {
        return url.toLowerCase();
      }
    };

    // Real visit history first (frecency-ranked), then curated quick links for
    // sites the user hasn't visited yet.
    for (const entry of historyEntries) {
      const key = keyFor(entry.url);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      items.push({
        id: `history-${entry.url}`,
        title: entry.title,
        url: entry.url,
        faviconUrl: entry.faviconUrl,
        visitCount: entry.visitCount,
        typedCount: entry.typedCount,
        lastVisited: entry.lastVisited
      });
    }

    for (const link of quickLinks) {
      const key = keyFor(link.url);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      items.push({ id: `quick-${link.id}`, title: link.label, url: link.url });
    }

    return items.slice(0, 60);
  }, [historyEntries, quickLinks]);

  const addressSuggestions = useMemo(() => {
    const query = addressValue.trim().toLowerCase();
    if (!query) {
      return [] as Array<{ id: string; title: string; url: string }>;
    }

    const seen = new Set<string>();
    const out: Array<{ id: string; title: string; url: string }> = [];
    const consider = (id: string, title: string, url: string) => {
      const key = url.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      if (`${title} ${url}`.toLowerCase().includes(query)) {
        seen.add(key);
        out.push({ id, title: title || url, url });
      }
    };

    for (const link of quickLinks) {
      consider(`ql-${link.id}`, link.label, link.url);
    }
    for (const site of recentSites) {
      consider(`rs-${site.id}`, site.title, site.url);
    }

    return out.slice(0, 6);
  }, [addressValue, quickLinks, recentSites]);

  const showAddressSuggestions =
    addressFocused && addressDirty && addressValue.trim().length > 0 && addressSuggestions.length > 0;
  const currentPageIcon = useMemo<IconName>(() => {
    if (activePane === "split") {
      return getPageFallbackIcon(splitUrl, false);
    }

    return getPageFallbackIcon(activeTab.url, activeTab.isStartPage);
  }, [activePane, activeTab.isStartPage, activeTab.url, splitUrl]);
  const currentPageTitle = activePane === "split" ? splitTitle : activeTab.title;
  const currentPageFaviconUrl = activePane === "split" ? splitFaviconUrl : activeTab.faviconUrl;
  const bookmarkUrl = activePane === "split" ? splitUrl : activeTab.isStartPage ? null : activeTab.url;
  const isBookmarked = isQuickLink(bookmarkUrl);
  const activeNavigationState =
    activePane === "split"
      ? splitNav
      : showReactStartPage
        ? DEFAULT_NAVIGATION_STATE
        : mainTabNav[activeTab.id] ?? DEFAULT_NAVIGATION_STATE;
  const loadingTabId =
    !showReactStartPage && mainTabNav[selectedSpace.activeTabId]?.isLoading
      ? selectedSpace.activeTabId
      : null;

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

  const sendLayoutMetrics = useCallback(
    (overrides: LayoutMetrics = {}) => {
      const metrics: LayoutMetrics = {
        sidebarWidth: sidebarWidthRef.current,
        sidebarCollapsed: isSidebarCollapsed,
        splitOpen: isSplitOpen,
        splitRatio: splitRatioRef.current,
        findOpen: isFindOpen,
        ...overrides
      };
      const metricsKey = JSON.stringify(metrics);
      if (lastLayoutMetricsKeyRef.current === metricsKey) {
        return;
      }

      lastLayoutMetricsKeyRef.current = metricsKey;
      void window.andromeda.setLayoutMetrics(metrics);
    },
    [isFindOpen, isSidebarCollapsed, isSplitOpen]
  );

  const flushContentLayout = useCallback(
    (splitOpen = isSplitOpen, force = false) => {
      sendContentLayout(getContentLayout(splitOpen), force);
    },
    [getContentLayout, isSplitOpen, sendContentLayout]
  );

  const markWindowResizing = useCallback(() => {
    const shell = appShellRef.current;
    if (shell) {
      shell.classList.add("is-window-resizing");
      if (windowResizeIdleRef.current !== null) {
        window.clearTimeout(windowResizeIdleRef.current);
      }
      windowResizeIdleRef.current = window.setTimeout(() => {
        windowResizeIdleRef.current = null;
        appShellRef.current?.classList.remove("is-window-resizing");
      }, 140);
    }
  }, []);

  useEffect(() => {
    sendLayoutMetrics();
    void window.andromeda.syncLayout();

    window.addEventListener("resize", markWindowResizing);

    return () => {
      if (windowResizeIdleRef.current !== null) {
        window.clearTimeout(windowResizeIdleRef.current);
      }
      if (spaceSwitchIdleRef.current !== null) {
        window.clearTimeout(spaceSwitchIdleRef.current);
      }
      appShellRef.current?.classList.remove("is-window-resizing");
      appShellRef.current?.classList.remove("is-switching-space");
      window.removeEventListener("resize", markWindowResizing);
    };
  }, [markWindowResizing, sendLayoutMetrics]);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
    splitRatioRef.current = splitRatio;
    sendLayoutMetrics({ sidebarWidth, splitRatio });
  }, [sendLayoutMetrics, sidebarWidth, splitRatio]);

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
      void window.andromeda.showTab(activeTab.id, activeTab.url);
    }
  }, [
    activePane,
    activeTab.id,
    activeTab.url,
    flushContentLayout,
    showReactStartPage,
    showStartPage
  ]);

  // Destroy native views for tabs that no longer exist (closed or evicted).
  const allTabIdsKey = useMemo(
    () => state.spaces.flatMap((space) => space.tabs.map((tab) => tab.id)).join(","),
    [state.spaces]
  );
  useEffect(() => {
    const ids = allTabIdsKey ? allTabIdsKey.split(",") : [];
    void window.andromeda.pruneTabs(ids);
  }, [allTabIdsKey]);

  useEffect(() => {
    if (!isSplitOpen || !splitUrl) {
      // Split closed (via the × button, switching tabs/spaces, etc.) — tear down
      // the native split view so it doesn't linger over the content.
      if (lastSplitRequestRef.current !== null) {
        void window.andromeda.closeSplitView();
      }
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
      } else {
        lastMainUrlRef.current = url;
      }
      updateActiveUrl(url, pane);
      recordVisit(url);
    });
  }, [activePane, recordVisit, updateActiveUrl]);

  useEffect(() => {
    return window.andromeda.onTitleUpdated(({ pane, title }) => {
      updateActiveTitle(title, pane);
      if (pane !== "split" && lastMainUrlRef.current) {
        recordMeta(lastMainUrlRef.current, { title });
      }
    });
  }, [recordMeta, updateActiveTitle]);

  useEffect(() => {
    return window.andromeda.onFaviconUpdated(({ pane, faviconUrl }) => {
      updateActiveFavicon(faviconUrl, pane);
      if (pane !== "split" && lastMainUrlRef.current) {
        recordMeta(lastMainUrlRef.current, { faviconUrl });
      }
    });
  }, [recordMeta, updateActiveFavicon]);

  useEffect(() => {
    return window.andromeda.onNavigationStateUpdated((navigationState) => {
      if (navigationState.pane !== "split") {
        return;
      }
      setSplitNav({
        canGoBack: navigationState.canGoBack,
        canGoForward: navigationState.canGoForward,
        isLoading: navigationState.isLoading
      });
    });
  }, []);

  useEffect(() => {
    return window.andromeda.onTabNavigated(({ tabId, url }) => {
      updateTabUrl(tabId, url);
      if (activePane === "main" && tabId === activeTab.id) {
        setAddressValue(getUrlDisplayValue(url));
      }
    });
  }, [activePane, activeTab.id, updateTabUrl]);

  useEffect(() => {
    return window.andromeda.onTabTitle(({ tabId, title }) => {
      updateTabTitle(tabId, title);
    });
  }, [updateTabTitle]);

  useEffect(() => {
    return window.andromeda.onTabFavicon(({ tabId, faviconUrl }) => {
      updateTabFavicon(tabId, faviconUrl);
    });
  }, [updateTabFavicon]);

  useEffect(() => {
    return window.andromeda.onTabNavState(({ tabId, canGoBack, canGoForward, isLoading }) => {
      setMainTabNav((current) => {
        const existing = current[tabId];
        if (
          existing &&
          existing.canGoBack === canGoBack &&
          existing.canGoForward === canGoForward &&
          existing.isLoading === isLoading
        ) {
          return current;
        }
        return { ...current, [tabId]: { canGoBack, canGoForward, isLoading } };
      });
    });
  }, []);

  useEffect(() => {
    return window.andromeda.onOpenTab(({ url }) => {
      openMainUrl(url);
    });
  }, [openMainUrl]);

  useEffect(() => {
    return window.andromeda.onDownload((payload) => {
      if (!seenDownloadIdsRef.current.has(payload.id)) {
        seenDownloadIdsRef.current.add(payload.id);
        setDownloadsOpen(true);
      }
      setDownloads((current) => {
        const index = current.findIndex((entry) => entry.id === payload.id);
        if (index >= 0) {
          const next = [...current];
          next[index] = payload;
          return next;
        }
        return [payload, ...current].slice(0, 20);
      });
    });
  }, []);

  useEffect(() => {
    return window.andromeda.onTabAudio(({ tabId, audible }) => {
      setTabAudio((current) => {
        const existing = current[tabId];
        if (existing && existing.audible === audible) {
          return current;
        }
        return { ...current, [tabId]: { audible, muted: existing?.muted ?? false } };
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

  // Large renderer overlays need the native web views detached. Lightweight
  // toolbar popovers stay non-destructive so the page does not blink away.
  const shouldDetachContentViews = isCommandBarOpen || isSettingsOpen;
  useEffect(() => {
    if (lastCommandBarOpenRef.current === shouldDetachContentViews) {
      return;
    }

    lastCommandBarOpenRef.current = shouldDetachContentViews;
    void window.andromeda.setCommandBarOpen(shouldDetachContentViews);
  }, [shouldDetachContentViews]);

  const navigateTo = useCallback(
    (url: string) => {
      flushContentLayout();
      openUrl(url);
      setAddressValue(getUrlDisplayValue(url));
    },
    [flushContentLayout, openUrl]
  );

  useEffect(() => {
    const timers: number[] = [];
    const unsubscribe = window.andromeda.onBenchmarkNavigate(({ urls, loadDelayMs }) => {
      timers.splice(0).forEach((timer) => window.clearTimeout(timer));
      urls.forEach((url, index) => {
        const timer = window.setTimeout(() => {
          navigateTo(url);
        }, index * Math.max(0, loadDelayMs));
        timers.push(timer);
      });
    });

    return () => {
      unsubscribe();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [navigateTo]);

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
    setAddressDirty(false);
    setAddressFocused(false);
    recordTyped(url);
    navigateTo(url);
  }, [addressValue, navigateTo, recordTyped]);

  const handleAddressChange = useCallback((value: string) => {
    setAddressValue(value);
    setAddressDirty(true);
  }, []);

  const handleAddressFocus = useCallback(() => {
    setAddressFocused(true);
    setAddressDirty(false);
  }, []);

  const handleAddressBlur = useCallback(() => {
    setAddressFocused(false);
  }, []);

  const handlePickSuggestion = useCallback(
    (url: string) => {
      setAddressDirty(false);
      setAddressFocused(false);
      addressInputRef.current?.blur();
      navigateTo(url);
    },
    [navigateTo]
  );

  const handleNewTab = useCallback(() => {
    setCommandBarMode("default");
    setCommandBarOpen(true);
    setAddressValue("");
  }, []);

  const beginSpaceSwitchPaint = useCallback(() => {
    const shell = appShellRef.current;
    if (!shell) {
      return;
    }

    shell.classList.add("is-switching-space");
    if (spaceSwitchIdleRef.current !== null) {
      window.clearTimeout(spaceSwitchIdleRef.current);
    }
    spaceSwitchIdleRef.current = window.setTimeout(() => {
      spaceSwitchIdleRef.current = null;
      appShellRef.current?.classList.remove("is-switching-space");
    }, 160);
  }, []);

  const handleSelectSpace = useCallback(
    (spaceId: SpaceId) => {
      if (spaceId !== state.selectedSpaceId) {
        beginSpaceSwitchPaint();
      }
      selectSpace(spaceId);
    },
    [beginSpaceSwitchPaint, selectSpace, state.selectedSpaceId]
  );

  const handleSwitchSpace = useCallback(
    (direction: "previous" | "next") => {
      if (state.spaces.length < 2) {
        return;
      }

      const currentIndex = state.spaces.findIndex((space) => space.id === state.selectedSpaceId);
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const delta = direction === "next" ? 1 : -1;
      const nextIndex = (safeIndex + delta + state.spaces.length) % state.spaces.length;
      beginSpaceSwitchPaint();
      selectSpace(state.spaces[nextIndex].id);
    },
    [beginSpaceSwitchPaint, selectSpace, state.selectedSpaceId, state.spaces]
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

  const handleSleepSidebarTab = useCallback(
    (spaceId: SpaceId, tabId: string) => {
      sleepTab(spaceId, tabId);
      void window.andromeda.sleepTab(tabId);
    },
    [sleepTab]
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

  const toggleSidebar = useCallback(() => {
    appShellRef.current?.classList.add("is-window-resizing");
    if (windowResizeIdleRef.current !== null) {
      window.clearTimeout(windowResizeIdleRef.current);
    }
    windowResizeIdleRef.current = window.setTimeout(() => {
      windowResizeIdleRef.current = null;
      appShellRef.current?.classList.remove("is-window-resizing");
    }, 180);
    setSidebarPeeking(false);
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        localStorage.setItem("andromeda.compact", next ? "1" : "0");
      } catch {
        // ignore storage failures
      }
      return next;
    });
  }, []);

  const handlePeekEnter = useCallback(() => {
    setSidebarPeeking(true);
  }, []);

  const handlePeekLeave = useCallback(() => {
    setSidebarPeeking(false);
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

  // Live, jank-free space recoloring: paint the shell vars directly on the DOM
  // (no React re-render) and drop the blur/transition while picking, then commit
  // to the store once the user settles.
  const handleSpaceColorPreview = useCallback(
    (spaceId: SpaceId, hex: string) => {
      pendingRecolorRef.current = { spaceId, hex };

      // Coalesce to one cheap repaint per frame (pointer events can fire faster
      // than the display refreshes).
      if (recolorRafRef.current == null) {
        recolorRafRef.current = requestAnimationFrame(() => {
          recolorRafRef.current = null;
          const pending = pendingRecolorRef.current;
          const shell = appShellRef.current;
          if (pending && shell) {
            shell.classList.add("is-recoloring");
            shell.style.setProperty("--accent", pending.hex);
            shell.style.setProperty("--grad-1", pending.hex);
            shell.style.setProperty("--grad-2", pending.hex);
            shell.style.setProperty("--grad-3", pending.hex);
          }
        });
      }

      // Commit to the store (rich rendering + persistence) once the user settles.
      if (recolorIdleRef.current) {
        window.clearTimeout(recolorIdleRef.current);
      }
      recolorIdleRef.current = window.setTimeout(() => {
        recolorIdleRef.current = null;
        if (recolorRafRef.current != null) {
          cancelAnimationFrame(recolorRafRef.current);
          recolorRafRef.current = null;
        }
        const pending = pendingRecolorRef.current;
        appShellRef.current?.classList.remove("is-recoloring");
        if (pending) {
          updateSpace(pending.spaceId, { colors: [pending.hex] });
        }
      }, 180);
    },
    [updateSpace]
  );

  const toggleDownloads = useCallback(() => {
    setSiteInfoOpen(false);
    setDownloadsOpen((open) => !open);
  }, []);
  const closeDownloads = useCallback(() => setDownloadsOpen(false), []);
  const toggleSiteInfo = useCallback(() => {
    setDownloadsOpen(false);
    setSiteInfoOpen((open) => !open);
  }, []);
  const closeSiteInfo = useCallback(() => setSiteInfoOpen(false), []);
  const handleOpenDownload = useCallback((path: string) => {
    if (path) {
      void window.andromeda.openDownload(path);
    }
  }, []);
  const handleRevealDownload = useCallback((path: string) => {
    if (path) {
      void window.andromeda.revealDownload(path);
    }
  }, []);
  const handleClearDownloads = useCallback(() => setDownloads([]), []);
  const hasActiveDownload = downloads.some((entry) => entry.state === "progressing");

  const handleToggleBookmark = useCallback(() => {
    if (!bookmarkUrl) {
      return;
    }
    toggleQuickLink(bookmarkUrl, currentPageTitle);
  }, [bookmarkUrl, currentPageTitle, toggleQuickLink]);

  const handleToggleMute = useCallback(
    (tabId: string) => {
      const muted = !(tabAudio[tabId]?.muted ?? false);
      void window.andromeda.setTabMuted(tabId, muted);
      setTabAudio((current) => ({
        ...current,
        [tabId]: { audible: current[tabId]?.audible ?? false, muted }
      }));
    },
    [tabAudio]
  );

  // Drag-to-resize keeps the page live, but coalesces native bounds updates and
  // temporarily disables expensive shell rendering.
  const handleSidebarResizeStart = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      setResizingSidebar(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const syncContentBounds = () => {
        if (sidebarResizeFrameRef.current !== null) {
          return;
        }

        sidebarResizeFrameRef.current = requestAnimationFrame(() => {
          sidebarResizeFrameRef.current = null;
          sendLayoutMetrics({ sidebarWidth: sidebarWidthRef.current });
        });
      };

      const onMove = (moveEvent: MouseEvent) => {
        const width = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.round(moveEvent.clientX)));
        if (sidebarWidthRef.current === width) {
          return;
        }
        sidebarWidthRef.current = width;
        appShellRef.current?.style.setProperty("--sidebar-width", `${width}px`);
        syncContentBounds();
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (sidebarResizeFrameRef.current !== null) {
          cancelAnimationFrame(sidebarResizeFrameRef.current);
          sidebarResizeFrameRef.current = null;
        }
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setResizingSidebar(false);
        const width = sidebarWidthRef.current;
        appShellRef.current?.style.setProperty("--sidebar-width", `${width}px`);
        setSidebarWidth(width);
        try {
          localStorage.setItem("andromeda.sidebarWidth", String(width));
        } catch {
          // ignore storage failures
        }
        flushContentLayout(undefined, true);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [flushContentLayout, sendLayoutMetrics]
  );

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
      recordTyped(url);
      if (target === "split") {
        return navigateSplitTo(url);
      }

      navigateTo(url);
      return undefined;
    },
    [navigateSplitTo, navigateTo, recordTyped]
  );

  const handleOpenUrlFromCommand = useCallback(
    (url: string, target: "active" | "split") => {
      if (target === "split") {
        navigateSplitTo(url);
        return;
      }
      navigateTo(url);
    },
    [navigateSplitTo, navigateTo]
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
        case "reopen-tab":
          reopenClosedTab();
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
      reopenClosedTab,
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
        ref={appShellRef}
        className={[
          "app-shell",
          isPureBlackTheme ? "is-pure-black" : "",
          isSidebarCollapsed ? "is-sidebar-collapsed" : "",
          isSidebarCollapsed && isSidebarPeeking ? "is-peeking" : "",
          isResizingSidebar ? "is-resizing-sidebar" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        style={shellStyle}
      >
        {isSidebarCollapsed && !isSidebarPeeking ? (
          <div
            className="sidebar-peek-zone"
            aria-hidden="true"
            onMouseEnter={handlePeekEnter}
          />
        ) : null}
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
          canBookmark={Boolean(bookmarkUrl)}
          isBookmarked={isBookmarked}
          hasActiveDownload={hasActiveDownload}
          profileInitial={(settings.name.trim().charAt(0) || "A").toUpperCase()}
          currentUrl={bookmarkUrl ?? ""}
          isSiteInfoOpen={isSiteInfoOpen}
          addressSuggestions={addressSuggestions}
          showAddressSuggestions={showAddressSuggestions}
          onAddressChange={handleAddressChange}
          onAddressFocus={handleAddressFocus}
          onAddressBlur={handleAddressBlur}
          onPickSuggestion={handlePickSuggestion}
          onSubmit={handleSubmitAddress}
          onBack={handleBack}
          onForward={handleForward}
          onReload={handleReload}
          onOpenSplitView={openSplitCommandBar}
          onToggleBookmark={handleToggleBookmark}
          onToggleDownloads={toggleDownloads}
          onToggleSiteInfo={toggleSiteInfo}
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
          onMouseLeave={isSidebarCollapsed ? handlePeekLeave : undefined}
          onResizeStart={handleSidebarResizeStart}
          onSelectSpace={handleSelectSpace}
          onCreateSpace={createSpace}
          onRenameSpace={renameSpace}
          onUpdateSpace={updateSpace}
          onPreviewSpaceColor={handleSpaceColorPreview}
          onDeleteSpace={deleteSpace}
          onReorderSpaces={reorderSpaces}
          onSwitchSpace={handleSwitchSpace}
          onSelectTab={handleSelectSidebarTab}
          onCloseTab={handleCloseSidebarTab}
          onTogglePinTab={togglePinTab}
          onDuplicateTab={duplicateTab}
          onCloseOtherTabs={closeOtherTabs}
          onSleepTab={handleSleepSidebarTab}
          onMoveTabToSpace={moveTabToSpace}
          loadingTabId={loadingTabId}
          tabAudio={tabAudio}
          onToggleMute={handleToggleMute}
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
              quickLinks={quickLinks}
              onOpenCommand={handleNewTab}
              onOpenLink={navigateTo}
              onRemoveQuickLink={removeQuickLink}
              onReorderQuickLink={reorderQuickLink}
              recentSites={recentSites}
            />
          ) : null}
        </div>
        <CommandBar
          isOpen={isCommandBarOpen}
          mode={commandBarMode}
          historyItems={quickOpenItems}
          onClose={closeCommandBar}
          onNavigateInput={handleCommandInputNavigation}
          onOpenUrl={handleOpenUrlFromCommand}
        />
        <SettingsPanel
          isOpen={isSettingsOpen}
          settings={settings}
          onUpdateSettings={updateSettings}
          onClose={closeSettings}
        />
        <DownloadsTray
          isOpen={isDownloadsOpen}
          downloads={downloads}
          onClose={closeDownloads}
          onOpen={handleOpenDownload}
          onReveal={handleRevealDownload}
          onClear={handleClearDownloads}
        />
        <SiteInfoPanel
          isOpen={isSiteInfoOpen}
          url={bookmarkUrl ?? ""}
          onClose={closeSiteInfo}
          onReload={handleReload}
        />
      </div>
    </div>
  );
}
