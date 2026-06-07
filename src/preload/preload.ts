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
  showTab: (tabId: string, url: string) => ipcRenderer.invoke("browser:showTab", { tabId, url }),
  pruneTabs: (ids: string[]) => ipcRenderer.invoke("browser:pruneTabs", { ids }),
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
  findInPage: (
    pane: BrowserPane,
    text: string,
    options?: { forward?: boolean; findNext?: boolean }
  ) =>
    ipcRenderer.invoke("browser:findInPage", {
      pane: sanitizePane(pane),
      text,
      forward: options?.forward !== false,
      findNext: options?.findNext === true
    }),
  stopFind: (pane: BrowserPane) =>
    ipcRenderer.invoke("browser:stopFind", { pane: sanitizePane(pane) }),
  setZoom: (pane: BrowserPane, direction: "in" | "out" | "reset") =>
    ipcRenderer.invoke("browser:setZoom", { pane: sanitizePane(pane), direction }),
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
  },
  onTabNavigated: (callback: (payload: { tabId: string; url: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        typeof (payload as { tabId?: unknown }).tabId === "string" &&
        typeof (payload as { url?: unknown }).url === "string"
      ) {
        callback(payload as { tabId: string; url: string });
      }
    };

    ipcRenderer.on("browser:tabNavigated", listener);
    return () => ipcRenderer.removeListener("browser:tabNavigated", listener);
  },
  onTabTitle: (callback: (payload: { tabId: string; title: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        typeof (payload as { tabId?: unknown }).tabId === "string" &&
        typeof (payload as { title?: unknown }).title === "string"
      ) {
        callback(payload as { tabId: string; title: string });
      }
    };

    ipcRenderer.on("browser:tabTitle", listener);
    return () => ipcRenderer.removeListener("browser:tabTitle", listener);
  },
  onTabFavicon: (callback: (payload: { tabId: string; faviconUrl: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        typeof (payload as { tabId?: unknown }).tabId === "string" &&
        typeof (payload as { faviconUrl?: unknown }).faviconUrl === "string"
      ) {
        callback(payload as { tabId: string; faviconUrl: string });
      }
    };

    ipcRenderer.on("browser:tabFavicon", listener);
    return () => ipcRenderer.removeListener("browser:tabFavicon", listener);
  },
  onTabNavState: (
    callback: (payload: {
      tabId: string;
      canGoBack: boolean;
      canGoForward: boolean;
      isLoading: boolean;
    }) => void
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        typeof (payload as { tabId?: unknown }).tabId === "string" &&
        typeof (payload as { canGoBack?: unknown }).canGoBack === "boolean"
      ) {
        callback(
          payload as {
            tabId: string;
            canGoBack: boolean;
            canGoForward: boolean;
            isLoading: boolean;
          }
        );
      }
    };

    ipcRenderer.on("browser:tabNavState", listener);
    return () => ipcRenderer.removeListener("browser:tabNavState", listener);
  },
  onOpenTab: (callback: (payload: { url: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        typeof (payload as { url?: unknown }).url === "string"
      ) {
        callback(payload as { url: string });
      }
    };

    ipcRenderer.on("browser:openTab", listener);
    return () => ipcRenderer.removeListener("browser:openTab", listener);
  },
  onShortcut: (callback: (action: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        typeof (payload as { action?: unknown }).action === "string"
      ) {
        callback((payload as { action: string }).action);
      }
    };

    ipcRenderer.on("browser:shortcut", listener);
    return () => ipcRenderer.removeListener("browser:shortcut", listener);
  },
  onFoundInPage: (
    callback: (payload: { pane: BrowserPane; activeMatchOrdinal: number; matches: number }) => void
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        typeof (payload as { activeMatchOrdinal?: unknown }).activeMatchOrdinal === "number" &&
        typeof (payload as { matches?: unknown }).matches === "number"
      ) {
        const data = payload as { pane: BrowserPane; activeMatchOrdinal: number; matches: number };
        callback({
          pane: sanitizePane(data.pane),
          activeMatchOrdinal: data.activeMatchOrdinal,
          matches: data.matches
        });
      }
    };

    ipcRenderer.on("browser:foundInPage", listener);
    return () => ipcRenderer.removeListener("browser:foundInPage", listener);
  }
});
