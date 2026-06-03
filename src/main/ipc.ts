import { BrowserWindow, IpcMainInvokeEvent, ipcMain } from "electron";
import { BrowserViewManager, ContentBounds } from "./browserViewManager";

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

function normalizeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(MAX_BOUND, Math.round(value)));
}

function setHandler(
  channel: string,
  listener: (event: IpcMainInvokeEvent, payload?: unknown) => void
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, listener);
}

export function registerIpc(manager: BrowserViewManager, window: BrowserWindow): void {
  setHandler("browser:navigate", (event, payload: unknown) => {
    assertTrustedSender(event, window);

    const url = (payload as { url?: unknown } | null)?.url;
    if (!isLoadableUrl(url)) {
      throw new Error("Invalid navigation URL");
    }

    manager.navigate(url);
  });

  setHandler("browser:goBack", (event) => {
    assertTrustedSender(event, window);
    manager.goBack();
  });

  setHandler("browser:goForward", (event) => {
    assertTrustedSender(event, window);
    manager.goForward();
  });

  setHandler("browser:reload", (event) => {
    assertTrustedSender(event, window);
    manager.reload();
  });

  setHandler("browser:showStartPage", (event) => {
    assertTrustedSender(event, window);
    manager.showStartPage();
  });

  setHandler("browser:resizeContentView", (event, payload: unknown) => {
    assertTrustedSender(event, window);

    const bounds = normalizeBounds(payload);
    if (!bounds) {
      throw new Error("Invalid content bounds");
    }

    manager.resize(bounds);
  });

  setHandler("browser:setCommandBarOpen", (event, payload: unknown) => {
    assertTrustedSender(event, window);

    const isOpen = (payload as { isOpen?: unknown } | null)?.isOpen;
    if (typeof isOpen !== "boolean") {
      throw new Error("Invalid command bar visibility");
    }

    manager.setCommandBarOpen(isOpen);
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
