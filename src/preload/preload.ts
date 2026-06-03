import { contextBridge, ipcRenderer } from "electron";

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

function isNavigationPayload(payload: unknown): payload is NavigationPayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      typeof (payload as NavigationPayload).url === "string"
  );
}

function isTitlePayload(payload: unknown): payload is TitlePayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      typeof (payload as TitlePayload).title === "string"
  );
}

contextBridge.exposeInMainWorld("andromeda", {
  navigate: (url: string) => ipcRenderer.invoke("browser:navigate", { url }),
  goBack: () => ipcRenderer.invoke("browser:goBack"),
  goForward: () => ipcRenderer.invoke("browser:goForward"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  showStartPage: () => ipcRenderer.invoke("browser:showStartPage"),
  setCommandBarOpen: (isOpen: boolean) =>
    ipcRenderer.invoke("browser:setCommandBarOpen", { isOpen }),
  resizeContentView: (bounds: ContentBounds) =>
    ipcRenderer.invoke("browser:resizeContentView", sanitizeBounds(bounds)),
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
  onOpenCommandBar: (callback: () => void) => {
    const listener = () => {
      callback();
    };

    ipcRenderer.on("browser:openCommandBar", listener);
    return () => ipcRenderer.removeListener("browser:openCommandBar", listener);
  }
});
