/// <reference types="vite/client" />

type ContentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BrowserPane = "main" | "split";

type ContentLayout = {
  main: ContentBounds;
  split?: ContentBounds | null;
};

type LayoutMetrics = {
  sidebarWidth?: number;
  sidebarCollapsed?: boolean;
  splitOpen?: boolean;
  splitRatio?: number;
  findOpen?: boolean;
};

type NavigationPayload = {
  pane: BrowserPane;
  url: string;
};

type TitlePayload = {
  pane: BrowserPane;
  title: string;
};

type FaviconPayload = {
  pane: BrowserPane;
  faviconUrl: string;
};

type NavigationStatePayload = {
  pane: BrowserPane;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
};

type FoundInPagePayload = {
  pane: BrowserPane;
  activeMatchOrdinal: number;
  matches: number;
};

type TabNavStatePayload = {
  tabId: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
};

type DownloadPayload = {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  receivedBytes: number;
  totalBytes: number;
  state: string;
};

type BenchmarkNavigatePayload = {
  urls: string[];
  loadDelayMs: number;
};

type ShieldStats = {
  active: boolean;
  enabled: boolean;
  blockedTotal: number;
  blockedOnPage: number;
};

type SitePermissions = {
  origin: string | null;
  permissions: string[];
};

interface Window {
  andromeda: {
    navigate: (url: string, pane?: BrowserPane) => Promise<void>;
    showTab: (tabId: string, url: string) => Promise<void>;
    pruneTabs: (ids: string[]) => Promise<void>;
    setTabMuted: (tabId: string, muted: boolean) => Promise<void>;
    sleepTab: (tabId: string) => Promise<void>;
    clearBrowsingData: () => Promise<void>;
    extractReadable: (
      pane?: BrowserPane
    ) => Promise<{ title: string; byline: string; html: string; url: string } | null>;
    openDownload: (path: string) => Promise<void>;
    revealDownload: (path: string) => Promise<void>;
    goBack: (pane?: BrowserPane) => Promise<void>;
    goForward: (pane?: BrowserPane) => Promise<void>;
    reload: (pane?: BrowserPane) => Promise<void>;
    showStartPage: () => Promise<void>;
    closeSplitView: () => Promise<void>;
    setActivePane: (pane: BrowserPane) => Promise<void>;
    setCommandBarOpen: (isOpen: boolean) => Promise<void>;
    findInPage: (
      pane: BrowserPane,
      text: string,
      options?: { forward?: boolean; findNext?: boolean }
    ) => Promise<void>;
    stopFind: (pane: BrowserPane) => Promise<void>;
    setZoom: (pane: BrowserPane, direction: "in" | "out" | "reset") => Promise<number>;
    getZoom: (pane?: BrowserPane) => Promise<number>;
    printPage: (pane?: BrowserPane) => Promise<void>;
    getShieldStats: (pane?: BrowserPane) => Promise<ShieldStats>;
    setAdblockEnabled: (enabled: boolean) => Promise<void>;
    getSitePermissions: (url: string) => Promise<SitePermissions>;
    revokeSitePermission: (url: string, permission: string) => Promise<void>;
    getAppInfo: () => Promise<{ version: string }>;
    resizeContentView: (layout: ContentBounds | ContentLayout) => Promise<void>;
    setLayoutMetrics: (metrics: LayoutMetrics) => Promise<void>;
    syncLayout: () => Promise<void>;
    closeWindow: () => Promise<void>;
    minimizeWindow: () => Promise<void>;
    toggleMaximizeWindow: () => Promise<void>;
    onDidNavigate: (callback: (payload: NavigationPayload) => void) => () => void;
    onTitleUpdated: (callback: (payload: TitlePayload) => void) => () => void;
    onFaviconUpdated: (callback: (payload: FaviconPayload) => void) => () => void;
    onNavigationStateUpdated: (callback: (payload: NavigationStatePayload) => void) => () => void;
    onPaneFocused: (callback: (payload: { pane: BrowserPane }) => void) => () => void;
    onOpenCommandBar: (callback: () => void) => () => void;
    onBenchmarkNavigate: (callback: (payload: BenchmarkNavigatePayload) => void) => () => void;
    onShortcut: (callback: (action: string) => void) => () => void;
    onFoundInPage: (callback: (payload: FoundInPagePayload) => void) => () => void;
    onTabNavigated: (callback: (payload: { tabId: string; url: string }) => void) => () => void;
    onTabTitle: (callback: (payload: { tabId: string; title: string }) => void) => () => void;
    onTabFavicon: (callback: (payload: { tabId: string; faviconUrl: string }) => void) => () => void;
    onTabNavState: (callback: (payload: TabNavStatePayload) => void) => () => void;
    onOpenTab: (callback: (payload: { url: string }) => void) => () => void;
    onTabAudio: (callback: (payload: { tabId: string; audible: boolean }) => void) => () => void;
    onDownload: (callback: (payload: DownloadPayload) => void) => () => void;
  };
}
