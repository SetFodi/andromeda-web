import path from "node:path";
import { existsSync } from "node:fs";
import { app, BrowserWindow } from "electron";
import { WebContentsViewManager } from "./webContentsViewManager";
import { registerIpc } from "./ipc";
import { buildAppMenu } from "./menu";

const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL);
let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
  if (mainWindow) {
    mainWindow.focus();
    return mainWindow;
  }

  const window = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    roundedCorners: true,
    backgroundColor: "#00000000",
    title: "Andromeda",
    trafficLightPosition: { x: -100, y: -100 },
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const manager = new WebContentsViewManager(window);
  registerIpc(manager, window);
  buildAppMenu(window);

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    mainWindow = null;
  });

  if (isDevelopment) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL as string);
  } else {
    void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow = window;
  return window;
}

function applyDockIcon(): void {
  if (process.platform !== "darwin" || !app.dock) {
    return;
  }

  const candidates = [
    path.join(app.getAppPath(), "andromeda.png"),
    path.join(__dirname, "../../andromeda.png"),
    path.join(process.cwd(), "andromeda.png"),
    path.join(process.resourcesPath ?? "", "andromeda.png")
  ];

  const iconPath = candidates.find((candidate) => candidate && existsSync(candidate));
  if (iconPath) {
    app.dock.setIcon(iconPath);
  }
}

app.whenReady().then(() => {
  applyDockIcon();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
