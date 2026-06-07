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

interface Window {
  andromeda: {
    navigate: (url: string, pane?: BrowserPane) => Promise<void>;
    showTab: (tabId: string, url: string) => Promise<void>;
    pruneTabs: (ids: string[]) => Promise<void>;
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
    setZoom: (pane: BrowserPane, direction: "in" | "out" | "reset") => Promise<void>;
    resizeContentView: (layout: ContentBounds | ContentLayout) => Promise<void>;
    closeWindow: () => Promise<void>;
    minimizeWindow: () => Promise<void>;
    toggleMaximizeWindow: () => Promise<void>;
    onDidNavigate: (callback: (payload: NavigationPayload) => void) => () => void;
    onTitleUpdated: (callback: (payload: TitlePayload) => void) => () => void;
    onFaviconUpdated: (callback: (payload: FaviconPayload) => void) => () => void;
    onNavigationStateUpdated: (callback: (payload: NavigationStatePayload) => void) => () => void;
    onPaneFocused: (callback: (payload: { pane: BrowserPane }) => void) => () => void;
    onOpenCommandBar: (callback: () => void) => () => void;
    onShortcut: (callback: (action: string) => void) => () => void;
    onFoundInPage: (callback: (payload: FoundInPagePayload) => void) => () => void;
    onTabNavigated: (callback: (payload: { tabId: string; url: string }) => void) => () => void;
    onTabTitle: (callback: (payload: { tabId: string; title: string }) => void) => () => void;
    onTabFavicon: (callback: (payload: { tabId: string; faviconUrl: string }) => void) => () => void;
    onTabNavState: (callback: (payload: TabNavStatePayload) => void) => () => void;
    onOpenTab: (callback: (payload: { url: string }) => void) => () => void;
  };
}
