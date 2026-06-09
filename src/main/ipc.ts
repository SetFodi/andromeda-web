import { BrowserWindow, IpcMainInvokeEvent, ipcMain, shell } from "electron";
import {
  BrowserPane,
  ContentBounds,
  ContentLayout,
  LayoutMetrics,
  WebContentsViewManager
} from "./webContentsViewManager";

const MAX_BOUND = 10000;

function isTrustedSender(event: IpcMainInvokeEvent, window: BrowserWindow): boolean {
  return event.sender === window.webContents;
}

function assertTrustedSender(event: IpcMainInvokeEvent, window: BrowserWindow): void {
  if (!isTrustedSender(event, window)) {
    throw new Error("Rejected IPC call from unknown sender");
  }
}

function isLoadableUrl(value: unknown): value is string {
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

function normalizePane(value: unknown): BrowserPane {
  return value === "split" ? "split" : "main";
}

function normalizeBounds(value: unknown): ContentBounds | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const x = normalizeNumber(candidate.x);
  const y = normalizeNumber(candidate.y);
  const width = normalizeNumber(candidate.width);
  const height = normalizeNumber(candidate.height);

  if (x === null || y === null || width === null || height === null) {
    return null;
  }

  return {
    x,
    y,
    width,
    height
  };
}

function normalizeLayout(value: unknown): ContentLayout | null {
  const directBounds = normalizeBounds(value);
  if (directBounds) {
    return { main: directBounds };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { main?: unknown; split?: unknown };
  const main = normalizeBounds(candidate.main);
  if (!main) {
    return null;
  }

  const split = candidate.split === null || candidate.split === undefined ? null : normalizeBounds(candidate.split);
  if (candidate.split !== null && candidate.split !== undefined && !split) {
    return null;
  }

  return {
    main,
    split
  };
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(MAX_BOUND, Math.round(value)));
}

function normalizeRatio(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeLayoutMetrics(value: unknown): Partial<LayoutMetrics> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const metrics: Partial<LayoutMetrics> = {};

  if (candidate.sidebarWidth !== undefined) {
    const sidebarWidth = normalizeNumber(candidate.sidebarWidth);
    if (sidebarWidth === null) {
      return null;
    }
    metrics.sidebarWidth = sidebarWidth;
  }

  if (candidate.sidebarCollapsed !== undefined) {
    if (typeof candidate.sidebarCollapsed !== "boolean") {
      return null;
    }
    metrics.sidebarCollapsed = candidate.sidebarCollapsed;
  }

  if (candidate.splitOpen !== undefined) {
    if (typeof candidate.splitOpen !== "boolean") {
      return null;
    }
    metrics.splitOpen = candidate.splitOpen;
  }

  if (candidate.splitRatio !== undefined) {
    const splitRatio = normalizeRatio(candidate.splitRatio);
    if (splitRatio === null) {
      return null;
    }
    metrics.splitRatio = splitRatio;
  }

  if (candidate.findOpen !== undefined) {
    if (typeof candidate.findOpen !== "boolean") {
      return null;
    }
    metrics.findOpen = candidate.findOpen;
  }

  return metrics;
}

function setHandler(
  channel: string,
  listener: (event: IpcMainInvokeEvent, payload?: unknown) => void
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, listener);
}

export function registerIpc(manager: WebContentsViewManager, window: BrowserWindow): void {
  setHandler("browser:navigate", (event, payload: unknown) => {
    assertTrustedSender(event, window);

    const url = (payload as { url?: unknown } | null)?.url;
    const pane = normalizePane((payload as { pane?: unknown } | null)?.pane);
    if (!isLoadableUrl(url)) {
      throw new Error("Invalid navigation URL");
    }

    manager.navigate(url, pane);
  });

  setHandler("browser:showTab", (event, payload: unknown) => {
    assertTrustedSender(event, window);

    const candidate = (payload ?? {}) as { tabId?: unknown; url?: unknown };
    if (typeof candidate.tabId !== "string" || !isLoadableUrl(candidate.url)) {
      throw new Error("Invalid tab navigation");
    }

    manager.showTab(candidate.tabId, candidate.url);
  });

  setHandler("browser:pruneTabs", (event, payload: unknown) => {
    assertTrustedSender(event, window);

    const ids = (payload as { ids?: unknown } | null)?.ids;
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
      throw new Error("Invalid tab id list");
    }

    manager.pruneTabs(ids as string[]);
  });

  setHandler("browser:openDownload", (event, payload: unknown) => {
    assertTrustedSender(event, window);
    const path = (payload as { path?: unknown } | null)?.path;
    if (typeof path !== "string" || !path) {
      throw new Error("Invalid download path");
    }
    void shell.openPath(path);
  });

  setHandler("browser:revealDownload", (event, payload: unknown) => {
    assertTrustedSender(event, window);
    const path = (payload as { path?: unknown } | null)?.path;
    if (typeof path !== "string" || !path) {
      throw new Error("Invalid download path");
    }
    shell.showItemInFolder(path);
  });

  setHandler("browser:setTabMuted", (event, payload: unknown) => {
    assertTrustedSender(event, window);

    const candidate = (payload ?? {}) as { tabId?: unknown; muted?: unknown };
    if (typeof candidate.tabId !== "string" || typeof candidate.muted !== "boolean") {
      throw new Error("Invalid mute request");
    }

    manager.setTabMuted(candidate.tabId, candidate.muted);
  });

  setHandler("browser:sleepTab", (event, payload: unknown) => {
    assertTrustedSender(event, window);

    const tabId = (payload as { tabId?: unknown } | null)?.tabId;
    if (typeof tabId !== "string" || !tabId) {
      throw new Error("Invalid tab id");
    }

    manager.sleepTab(tabId);
  });

  setHandler("browser:goBack", (event, payload: unknown) => {
    assertTrustedSender(event, window);
    manager.goBack(normalizePane((payload as { pane?: unknown } | null)?.pane));
  });

  setHandler("browser:goForward", (event, payload: unknown) => {
    assertTrustedSender(event, window);
    manager.goForward(normalizePane((payload as { pane?: unknown } | null)?.pane));
  });

  setHandler("browser:reload", (event, payload: unknown) => {
    assertTrustedSender(event, window);
    manager.reload(normalizePane((payload as { pane?: unknown } | null)?.pane));
  });

  setHandler("browser:showStartPage", (event) => {
    assertTrustedSender(event, window);
    manager.showStartPage();
  });

  setHandler("browser:resizeContentView", (event, payload: unknown) => {
    assertTrustedSender(event, window);

    const layout = normalizeLayout(payload);
    if (!layout) {
      throw new Error("Invalid content bounds");
    }

    manager.resize(layout);
  });

  setHandler("browser:setLayoutMetrics", (event, payload: unknown) => {
    assertTrustedSender(event, window);

    const metrics = normalizeLayoutMetrics(payload);
    if (!metrics) {
      throw new Error("Invalid layout metrics");
    }

    manager.setLayoutMetrics(metrics);
  });

  setHandler("browser:syncLayout", (event) => {
    assertTrustedSender(event, window);
    manager.syncLayoutFromWindow();
  });

  setHandler("browser:setActivePane", (event, payload: unknown) => {
    assertTrustedSender(event, window);
    manager.setActivePane(normalizePane((payload as { pane?: unknown } | null)?.pane));
  });

  setHandler("browser:closeSplitView", (event) => {
    assertTrustedSender(event, window);
    manager.closeSplitView();
  });

  setHandler("browser:findInPage", (event, payload: unknown) => {
    assertTrustedSender(event, window);

    const candidate = (payload ?? {}) as {
      pane?: unknown;
      text?: unknown;
      forward?: unknown;
      findNext?: unknown;
    };
    if (typeof candidate.text !== "string") {
      throw new Error("Invalid find query");
    }

    manager.findInPage(normalizePane(candidate.pane), candidate.text, {
      forward: candidate.forward !== false,
      findNext: candidate.findNext === true
    });
  });

  setHandler("browser:stopFind", (event, payload: unknown) => {
    assertTrustedSender(event, window);
    manager.stopFind(normalizePane((payload as { pane?: unknown } | null)?.pane));
  });

  setHandler("browser:setZoom", (event, payload: unknown) => {
    assertTrustedSender(event, window);

    const direction = (payload as { direction?: unknown } | null)?.direction;
    if (direction !== "in" && direction !== "out" && direction !== "reset") {
      throw new Error("Invalid zoom direction");
    }

    manager.adjustZoom(normalizePane((payload as { pane?: unknown } | null)?.pane), direction);
  });

  setHandler("browser:setCommandBarOpen", (event, payload: unknown) => {
    assertTrustedSender(event, window);

    const isOpen = (payload as { isOpen?: unknown } | null)?.isOpen;
    if (typeof isOpen !== "boolean") {
      throw new Error("Invalid command bar visibility");
    }

    manager.setCommandBarOpen(isOpen);
  });

  setHandler("browser:clearBrowsingData", async (event) => {
    assertTrustedSender(event, window);
    const session = window.webContents.session;
    await session.clearCache();
    await session.clearStorageData({
      storages: ["cachestorage", "serviceworkers", "shadercache"]
    });
  });

  setHandler("window:close", (event) => {
    assertTrustedSender(event, window);
    window.close();
  });

  setHandler("window:minimize", (event) => {
    assertTrustedSender(event, window);
    window.minimize();
  });

  setHandler("window:toggleMaximize", (event) => {
    assertTrustedSender(event, window);

    if (window.isMaximized()) {
      window.unmaximize();
      return;
    }

    window.maximize();
  });
}
