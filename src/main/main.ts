import path from "node:path";
import { appendFileSync, existsSync } from "node:fs";
import { app, BrowserWindow, components, crashReporter, dialog } from "electron";
import { WebContentsViewManager } from "./webContentsViewManager";
import { registerIpc } from "./ipc";
import { buildAppMenu } from "./menu";
import { setupAdblocker } from "./adblocker";
import { setupSecurityPolicy } from "./security";
import { startUpdateChecks } from "./updater";
import { setupHttpAuth } from "./auth";

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

// Native crash capture: collect renderer/GPU/utility minidumps to a local
// directory so a daily-driver crash leaves a diagnosable artifact. Nothing is
// uploaded (uploadToServer:false) — local-only signal, not telemetry.
crashReporter.start({ uploadToServer: false, compress: true });

// A main-process JS exception would otherwise kill the whole app silently.
// Append it (timestamped) to userData so it can be inspected or sent.
function logMainError(scope: string, error: unknown): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  try {
    appendFileSync(
      path.join(app.getPath("userData"), "andromeda-main-errors.log"),
      `[${new Date().toISOString()}] ${scope}: ${detail}\n`
    );
  } catch {
    // best-effort — disk full / unavailable
  }
  console.error(scope, error);
}
process.on("uncaughtException", (error) => logMainError("uncaughtException", error));
process.on("unhandledRejection", (reason) => logMainError("unhandledRejection", reason));

// TLS certificate errors: instead of a hard, unbypassable failure (which breaks
// captive portals and self-signed internal/staging sites), let the user make an
// informed choice — Chrome-style "proceed anyway". Deduped per host so a page's
// subresource errors don't stack dialogs.
const certPrompts = new Map<string, Promise<boolean>>();
app.on("certificate-error", (event, webContents, url, error, _certificate, callback) => {
  event.preventDefault();
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // keep the raw URL as the label
  }
  const existing = certPrompts.get(host);
  if (existing) {
    void existing.then(callback);
    return;
  }
  const parent = BrowserWindow.fromWebContents(webContents) ?? mainWindow;
  const options: Electron.MessageBoxOptions = {
    type: "warning",
    buttons: ["Back to safety", "Proceed anyway"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: "Connection not private",
    message: `The security certificate for ${host} is not valid (${error}).`,
    detail: "Someone may be impersonating this site to steal your information. Only continue if you understand the risk."
  };
  const prompt = (parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options))
    .then(({ response }) => response === 1)
    .finally(() => certPrompts.delete(host));
  certPrompts.set(host, prompt);
  void prompt.then(callback);
});

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
  setupHttpAuth(window);
  const manager = new WebContentsViewManager(window);
  registerIpc(manager, window);
  buildAppMenu(window);
  if (__ANDROMEDA_BENCH__) {
    scheduleBenchmarkNavigation(window);
  }
  startUpdateChecks(window);

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

  // Lock the privileged chrome to its own document. A dropped or programmatic
  // link must never navigate the app renderer (it carries the full IPC bridge);
  // real links are routed to a normal tab instead.
  const isInternalChromeUrl = (target: string): boolean => {
    try {
      const url = new URL(target);
      if (isDevelopment) {
        return url.origin === new URL(process.env.ELECTRON_RENDERER_URL as string).origin;
      }
      return url.protocol === "file:";
    } catch {
      return false;
    }
  };
  window.webContents.on("will-navigate", (event, url) => {
    if (isInternalChromeUrl(url)) {
      return;
    }
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) {
      window.webContents.send("browser:openTab", { url });
    }
  });

  // If the privileged renderer process itself dies, the window goes blank with
  // the web views still composited on top — no in-app escape. Reload the shell
  // so it re-mounts and restores the session, with a cap so a renderer that
  // crashes on load can't spin in a hot reload loop. Clean exits are ignored.
  let shellReloads = 0;
  let shellReloadWindowStart = Date.now();
  window.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit" || window.isDestroyed()) {
      return;
    }
    const now = Date.now();
    if (now - shellReloadWindowStart > 60_000) {
      shellReloadWindowStart = now;
      shellReloads = 0;
    }
    shellReloads += 1;
    if (shellReloads > 3) {
      return;
    }
    window.webContents.reload();
  });
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

// The castlabs Electron build ships a `components` module that downloads and
// registers the Widevine CDM (for DRM playback — Netflix, Spotify, etc.). It is
// absent in stock Electron. Registration runs in the background so it never
// blocks startup; the CDM is cached after the first run.
function registerWidevine(): void {
  if (typeof components?.whenReady !== "function") {
    return;
  }

  components
    .whenReady()
    .then(() => {
      console.log("[widevine] CDM components ready");
    })
    .catch((error: unknown) => {
      console.error("[widevine] CDM failed to initialize", error);
    });
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
  registerWidevine();
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
