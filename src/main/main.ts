import path from "node:path";
import { existsSync } from "node:fs";
import { app, BrowserWindow } from "electron";
import { WebContentsViewManager } from "./webContentsViewManager";
import { registerIpc } from "./ipc";
import { buildAppMenu } from "./menu";
import { setupAdblocker } from "./adblocker";
import { setupSecurityPolicy } from "./security";

const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL);
let mainWindow: BrowserWindow | null = null;

// Two-finger overscroll history navigation (Windows/Linux; no-op on macOS,
// where the window-level swipe event below handles it).
app.commandLine.appendSwitch("enable-features", "TouchpadOverscrollHistoryNavigation");

// Sites (notably Google sign-in) reject user agents that advertise Electron as
// "insecure browsers". Present as the plain Chrome build we actually are.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sandromeda\/\S+/i, "")
  .replace(/\sElectron\/\S+/, "");

function getBenchmarkUrls(): string[] {
  if (!process.env.ANDROMEDA_BENCHMARK_URLS) {
    return [];
  }

  try {
    const urls = JSON.parse(process.env.ANDROMEDA_BENCHMARK_URLS) as unknown;
    if (!Array.isArray(urls)) {
      return [];
    }

    return urls.filter((url): url is string => typeof url === "string" && /^https?:\/\//.test(url));
  } catch {
    return [];
  }
}

function getBenchmarkDelay(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function scheduleBenchmarkNavigation(window: BrowserWindow): void {
  const urls = getBenchmarkUrls();
  if (urls.length === 0) {
    return;
  }

  const initialDelay = getBenchmarkDelay("ANDROMEDA_BENCHMARK_NAVIGATE_DELAY_MS", 3000);
  const loadDelay = getBenchmarkDelay("ANDROMEDA_BENCHMARK_LOAD_WAIT_MS", 10000);

  window.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      if (!window.isDestroyed()) {
        window.webContents.send("browser:benchmarkNavigate", { urls, loadDelayMs: loadDelay });
      }
    }, initialDelay);
  });
}

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

  setupSecurityPolicy(window);
  const manager = new WebContentsViewManager(window);
  registerIpc(manager, window);
  buildAppMenu(window);
  scheduleBenchmarkNavigation(window);

  // macOS trackpad swipe navigation (fires per the system "Swipe between
  // pages" gesture setting). Fingers right reveals the previous page.
  window.on("swipe", (_event, direction) => {
    if (direction === "right") {
      manager.goBack();
    } else if (direction === "left") {
      manager.goForward();
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const showWindow = () => {
    if (!window.isDestroyed() && !window.isVisible()) {
      window.show();
    }
  };

  window.once("ready-to-show", showWindow);
  window.webContents.once("did-finish-load", showWindow);
  setTimeout(showWindow, 2500);
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
  void setupAdblocker();
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
