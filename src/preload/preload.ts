import { contextBridge, ipcRenderer } from "electron";

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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeBounds(bounds: ContentBounds): ContentBounds {
  if (
    !isFiniteNumber(bounds.x) ||
    !isFiniteNumber(bounds.y) ||
    !isFiniteNumber(bounds.width) ||
    !isFiniteNumber(bounds.height)
  ) {
    throw new Error("Invalid content bounds");
  }

  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  };
}

function sanitizePane(pane?: BrowserPane): BrowserPane {
  return pane === "split" ? "split" : "main";
}

function sanitizeLayout(layout: ContentBounds | ContentLayout): ContentLayout {
  if ("main" in layout) {
    return {
      main: sanitizeBounds(layout.main),
      split: layout.split ? sanitizeBounds(layout.split) : null
    };
  }

  return {
    main: sanitizeBounds(layout)
  };
}

function isNavigationPayload(payload: unknown): payload is NavigationPayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      ((payload as NavigationPayload).pane === "main" ||
        (payload as NavigationPayload).pane === "split") &&
      typeof (payload as NavigationPayload).url === "string"
  );
}

function isTitlePayload(payload: unknown): payload is TitlePayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      ((payload as TitlePayload).pane === "main" || (payload as TitlePayload).pane === "split") &&
      typeof (payload as TitlePayload).title === "string"
  );
}

function isFaviconPayload(payload: unknown): payload is FaviconPayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      ((payload as FaviconPayload).pane === "main" ||
        (payload as FaviconPayload).pane === "split") &&
      typeof (payload as FaviconPayload).faviconUrl === "string"
  );
}

function isNavigationStatePayload(payload: unknown): payload is NavigationStatePayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      ((payload as NavigationStatePayload).pane === "main" ||
        (payload as NavigationStatePayload).pane === "split") &&
      typeof (payload as NavigationStatePayload).canGoBack === "boolean" &&
      typeof (payload as NavigationStatePayload).canGoForward === "boolean" &&
      typeof (payload as NavigationStatePayload).isLoading === "boolean"
  );
}

contextBridge.exposeInMainWorld("andromeda", {
  navigate: (url: string, pane?: BrowserPane) =>
    ipcRenderer.invoke("browser:navigate", { pane: sanitizePane(pane), url }),
  goBack: (pane?: BrowserPane) => ipcRenderer.invoke("browser:goBack", { pane: sanitizePane(pane) }),
  goForward: (pane?: BrowserPane) =>
    ipcRenderer.invoke("browser:goForward", { pane: sanitizePane(pane) }),
  reload: (pane?: BrowserPane) => ipcRenderer.invoke("browser:reload", { pane: sanitizePane(pane) }),
  showStartPage: () => ipcRenderer.invoke("browser:showStartPage"),
  closeSplitView: () => ipcRenderer.invoke("browser:closeSplitView"),
  setActivePane: (pane: BrowserPane) =>
    ipcRenderer.invoke("browser:setActivePane", { pane: sanitizePane(pane) }),
  setCommandBarOpen: (isOpen: boolean) =>
    ipcRenderer.invoke("browser:setCommandBarOpen", { isOpen }),
  resizeContentView: (layout: ContentBounds | ContentLayout) =>
    ipcRenderer.invoke("browser:resizeContentView", sanitizeLayout(layout)),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggleMaximize"),
  onDidNavigate: (callback: (payload: NavigationPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (isNavigationPayload(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on("browser:didNavigate", listener);
    return () => ipcRenderer.removeListener("browser:didNavigate", listener);
  },
  onTitleUpdated: (callback: (payload: TitlePayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (isTitlePayload(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on("browser:titleUpdated", listener);
    return () => ipcRenderer.removeListener("browser:titleUpdated", listener);
  },
  onFaviconUpdated: (callback: (payload: FaviconPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (isFaviconPayload(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on("browser:faviconUpdated", listener);
    return () => ipcRenderer.removeListener("browser:faviconUpdated", listener);
  },
  onNavigationStateUpdated: (callback: (payload: NavigationStatePayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (isNavigationStatePayload(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on("browser:navigationStateUpdated", listener);
    return () => ipcRenderer.removeListener("browser:navigationStateUpdated", listener);
  },
  onPaneFocused: (callback: (payload: { pane: BrowserPane }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        ((payload as { pane?: unknown }).pane === "main" ||
          (payload as { pane?: unknown }).pane === "split")
      ) {
        callback({ pane: (payload as { pane: BrowserPane }).pane });
      }
    };

    ipcRenderer.on("browser:paneFocused", listener);
    return () => ipcRenderer.removeListener("browser:paneFocused", listener);
  },
  onOpenCommandBar: (callback: () => void) => {
    const listener = () => {
      callback();
    };

    ipcRenderer.on("browser:openCommandBar", listener);
    return () => ipcRenderer.removeListener("browser:openCommandBar", listener);
  }
});
