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

interface Window {
  andromeda: {
    navigate: (url: string, pane?: BrowserPane) => Promise<void>;
    goBack: (pane?: BrowserPane) => Promise<void>;
    goForward: (pane?: BrowserPane) => Promise<void>;
    reload: (pane?: BrowserPane) => Promise<void>;
    showStartPage: () => Promise<void>;
    closeSplitView: () => Promise<void>;
    setActivePane: (pane: BrowserPane) => Promise<void>;
    setCommandBarOpen: (isOpen: boolean) => Promise<void>;
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
  };
}
