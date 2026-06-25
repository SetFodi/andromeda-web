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

type SavePasswordPromptPayload = {
  origin: string;
  username: string;
  mode: "save" | "update";
};

type AuthPromptPayload = {
  id: string;
  host: string;
  port: number;
  realm: string;
  isProxy: boolean;
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

function sanitizeLayoutMetrics(metrics: LayoutMetrics): LayoutMetrics {
  const sanitized: LayoutMetrics = {};

  if (metrics.sidebarWidth !== undefined) {
    if (!isFiniteNumber(metrics.sidebarWidth)) {
      throw new Error("Invalid sidebar width");
    }
    sanitized.sidebarWidth = metrics.sidebarWidth;
  }

  if (metrics.sidebarCollapsed !== undefined) {
    if (typeof metrics.sidebarCollapsed !== "boolean") {
      throw new Error("Invalid sidebar collapsed state");
    }
    sanitized.sidebarCollapsed = metrics.sidebarCollapsed;
  }

  if (metrics.splitOpen !== undefined) {
    if (typeof metrics.splitOpen !== "boolean") {
      throw new Error("Invalid split state");
    }
    sanitized.splitOpen = metrics.splitOpen;
  }

  if (metrics.splitRatio !== undefined) {
    if (!isFiniteNumber(metrics.splitRatio)) {
      throw new Error("Invalid split ratio");
    }
    sanitized.splitRatio = metrics.splitRatio;
  }

  if (metrics.findOpen !== undefined) {
    if (typeof metrics.findOpen !== "boolean") {
      throw new Error("Invalid find state");
    }
    sanitized.findOpen = metrics.findOpen;
  }

  return sanitized;
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

function isBenchmarkNavigatePayload(payload: unknown): payload is BenchmarkNavigatePayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      Array.isArray((payload as BenchmarkNavigatePayload).urls) &&
      (payload as BenchmarkNavigatePayload).urls.every(
        (url: unknown) => typeof url === "string" && /^https?:\/\//.test(url)
      ) &&
      typeof (payload as BenchmarkNavigatePayload).loadDelayMs === "number" &&
      Number.isFinite((payload as BenchmarkNavigatePayload).loadDelayMs)
  );
}

const benchmarkNavigateQueue: BenchmarkNavigatePayload[] = [];
const benchmarkNavigateCallbacks = new Set<(payload: BenchmarkNavigatePayload) => void>();

if (__ANDROMEDA_BENCH__) {
  ipcRenderer.on("browser:benchmarkNavigate", (_event, payload: unknown) => {
    if (!isBenchmarkNavigatePayload(payload)) {
      return;
    }

    if (benchmarkNavigateCallbacks.size === 0) {
      benchmarkNavigateQueue.push(payload);
      return;
    }

    for (const callback of benchmarkNavigateCallbacks) {
      callback(payload);
    }
  });
}

contextBridge.exposeInMainWorld("andromeda", {
  navigate: (url: string, pane?: BrowserPane) =>
    ipcRenderer.invoke("browser:navigate", { pane: sanitizePane(pane), url }),
  showTab: (tabId: string, url: string) => ipcRenderer.invoke("browser:showTab", { tabId, url }),
  pruneTabs: (ids: string[]) => ipcRenderer.invoke("browser:pruneTabs", { ids }),
  setTabMuted: (tabId: string, muted: boolean) =>
    ipcRenderer.invoke("browser:setTabMuted", { tabId, muted }),
  sleepTab: (tabId: string) => ipcRenderer.invoke("browser:sleepTab", { tabId }),
  clearBrowsingData: () => ipcRenderer.invoke("browser:clearBrowsingData"),
  extractReadable: (pane?: BrowserPane) =>
    ipcRenderer.invoke("browser:extractReadable", { pane: sanitizePane(pane) }),
  openDownload: (path: string) => ipcRenderer.invoke("browser:openDownload", { path }),
  revealDownload: (path: string) => ipcRenderer.invoke("browser:revealDownload", { path }),
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
  getZoom: (pane?: BrowserPane) =>
    ipcRenderer.invoke("browser:getZoom", { pane: sanitizePane(pane) }),
  printPage: (pane?: BrowserPane) =>
    ipcRenderer.invoke("browser:print", { pane: sanitizePane(pane) }),
  getShieldStats: (pane?: BrowserPane) =>
    ipcRenderer.invoke("browser:getShieldStats", { pane: sanitizePane(pane) }),
  setAdblockEnabled: (enabled: boolean) =>
    ipcRenderer.invoke("browser:setAdblockEnabled", { enabled: enabled === true }),
  getSitePermissions: (url: string) =>
    ipcRenderer.invoke("browser:getSitePermissions", { url: String(url) }),
  revokeSitePermission: (url: string, permission: string) =>
    ipcRenderer.invoke("browser:revokeSitePermission", {
      url: String(url),
      permission: String(permission)
    }),
  getAppInfo: () => ipcRenderer.invoke("browser:getAppInfo"),
  respondSavePassword: (origin: string, action: "save" | "never" | "dismiss") =>
    ipcRenderer.invoke("passwords:respond", {
      origin: String(origin),
      action: action === "save" || action === "never" ? action : "dismiss"
    }),
  listPasswords: () => ipcRenderer.invoke("passwords:list"),
  deletePassword: (id: string) => ipcRenderer.invoke("passwords:delete", { id: String(id) }),
  revealPassword: (id: string) => ipcRenderer.invoke("passwords:reveal", { id: String(id) }),
  passwordsAvailable: () => ipcRenderer.invoke("passwords:available"),
  importAvailable: () => ipcRenderer.invoke("import:available"),
  importBookmarks: () => ipcRenderer.invoke("import:bookmarks"),
  importHistory: () => ipcRenderer.invoke("import:history"),
  importPasswords: () => ipcRenderer.invoke("import:passwords"),
  checkForUpdate: () => ipcRenderer.invoke("update:check"),
  openUpdate: (url: string) => ipcRenderer.invoke("update:open", { url: String(url) }),
  onUpdateAvailable: (callback: (payload: { version: string; url: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        typeof (payload as { version?: unknown }).version === "string" &&
        typeof (payload as { url?: unknown }).url === "string"
      ) {
        callback(payload as { version: string; url: string });
      }
    };

    ipcRenderer.on("browser:updateAvailable", listener);
    return () => ipcRenderer.removeListener("browser:updateAvailable", listener);
  },
  onSavePasswordPrompt: (callback: (payload: SavePasswordPromptPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        typeof (payload as { origin?: unknown }).origin === "string" &&
        typeof (payload as { username?: unknown }).username === "string" &&
        ((payload as { mode?: unknown }).mode === "save" ||
          (payload as { mode?: unknown }).mode === "update")
      ) {
        callback(payload as SavePasswordPromptPayload);
      }
    };

    ipcRenderer.on("passwords:savePrompt", listener);
    return () => ipcRenderer.removeListener("passwords:savePrompt", listener);
  },
  respondAuth: (id: string, username: string, password: string) =>
    ipcRenderer.invoke("auth:respond", {
      id: String(id),
      username: String(username),
      password: String(password)
    }),
  cancelAuth: (id: string) => ipcRenderer.invoke("auth:respond", { id: String(id), cancel: true }),
  onAuthPrompt: (callback: (payload: AuthPromptPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        typeof (payload as { id?: unknown }).id === "string" &&
        typeof (payload as { host?: unknown }).host === "string"
      ) {
        callback(payload as AuthPromptPayload);
      }
    };
    ipcRenderer.on("browser:authPrompt", listener);
    return () => ipcRenderer.removeListener("browser:authPrompt", listener);
  },
  resizeContentView: (layout: ContentBounds | ContentLayout) =>
    ipcRenderer.invoke("browser:resizeContentView", sanitizeLayout(layout)),
  setLayoutMetrics: (metrics: LayoutMetrics) =>
    ipcRenderer.invoke("browser:setLayoutMetrics", sanitizeLayoutMetrics(metrics)),
  syncLayout: () => ipcRenderer.invoke("browser:syncLayout"),
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
  onBenchmarkNavigate: (callback: (payload: BenchmarkNavigatePayload) => void) => {
    benchmarkNavigateCallbacks.add(callback);
    benchmarkNavigateQueue.splice(0).forEach((payload) => callback(payload));
    return () => {
      benchmarkNavigateCallbacks.delete(callback);
    };
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
  onTabAudio: (callback: (payload: { tabId: string; audible: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        typeof (payload as { tabId?: unknown }).tabId === "string" &&
        typeof (payload as { audible?: unknown }).audible === "boolean"
      ) {
        callback(payload as { tabId: string; audible: boolean });
      }
    };

    ipcRenderer.on("browser:tabAudio", listener);
    return () => ipcRenderer.removeListener("browser:tabAudio", listener);
  },
  onDownload: (callback: (payload: DownloadPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        typeof (payload as { id?: unknown }).id === "string"
      ) {
        callback(payload as DownloadPayload);
      }
    };

    ipcRenderer.on("browser:download", listener);
    return () => ipcRenderer.removeListener("browser:download", listener);
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
