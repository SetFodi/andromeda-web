/// <reference types="vite/client" />

type ContentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type NavigationPayload = {
  url: string;
};

type TitlePayload = {
  title: string;
};

interface Window {
  andromeda: {
    navigate: (url: string) => Promise<void>;
    goBack: () => Promise<void>;
    goForward: () => Promise<void>;
    reload: () => Promise<void>;
    showStartPage: () => Promise<void>;
    setCommandBarOpen: (isOpen: boolean) => Promise<void>;
    resizeContentView: (bounds: ContentBounds) => Promise<void>;
    closeWindow: () => Promise<void>;
    minimizeWindow: () => Promise<void>;
    toggleMaximizeWindow: () => Promise<void>;
    onDidNavigate: (callback: (payload: NavigationPayload) => void) => () => void;
    onTitleUpdated: (callback: (payload: TitlePayload) => void) => () => void;
    onOpenCommandBar: (callback: () => void) => () => void;
  };
}
