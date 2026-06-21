import { app, session as electronSession, type Session } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ElectronBlocker, type Config } from "@ghostery/adblocker-electron";

let blocker: ElectronBlocker | null = null;
let boundSession: Session | null = null;
let enabled = true;
let blockedTotal = 0;
// Per-page tracker counts keyed by webContents id; reset on main-frame commits
// so the site-info shield always reflects the current page.
const blockedByWebContents = new Map<number, number>();

// Filter lists are cached to disk and never refreshed on their own, so they go
// stale over time. We re-fetch the prebuilt lists on a slow cadence.
let cachePath: string | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
const LIST_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LIST_STALE_MS = 18 * 60 * 60 * 1000;
const FIRST_REFRESH_DELAY_MS = 30_000;

type MutableConfig = {
  -readonly [Key in keyof Config]: Config[Key];
};

type AdblockPrefs = {
  adblock?: boolean;
};

function prefsPath(): string {
  return path.join(app.getPath("userData"), "andromeda-prefs.json");
}

async function readPrefs(): Promise<AdblockPrefs> {
  try {
    const raw = await fs.readFile(prefsPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as AdblockPrefs) : {};
  } catch {
    return {};
  }
}

async function writePrefs(patch: AdblockPrefs): Promise<void> {
  try {
    const current = await readPrefs();
    await fs.writeFile(prefsPath(), JSON.stringify({ ...current, ...patch }));
  } catch {
    // Preferences are best-effort; blocking still works for this launch.
  }
}

export function getAdblockStats(): { active: boolean; enabled: boolean; blocked: number } {
  return { active: blocker !== null, enabled, blocked: blockedTotal };
}

export function getBlockedCountForWebContents(webContentsId: number): number {
  return blockedByWebContents.get(webContentsId) ?? 0;
}

export function resetBlockedCountForWebContents(webContentsId: number): void {
  blockedByWebContents.delete(webContentsId);
}

export function setAdblockEnabled(next: boolean): void {
  enabled = next;
  if (blocker && boundSession) {
    if (next && !blocker.isBlockingEnabled(boundSession)) {
      blocker.enableBlockingInSession(boundSession);
    } else if (!next && blocker.isBlockingEnabled(boundSession)) {
      blocker.disableBlockingInSession(boundSession);
    }
  }
  void writePrefs({ adblock: next });
}

function applyNetworkOnlyConfig(engine: ElectronBlocker): void {
  const config = engine.config as unknown as MutableConfig;
  config.loadCosmeticFilters = false;
  config.loadGenericCosmeticsFilters = false;
  config.loadExtendedSelectors = false;
  config.enableMutationObserver = false;
  config.enablePushInjectionsOnNavigationEvents = false;
  config.loadNetworkFilters = true;
}

function trackBlockedRequests(engine: ElectronBlocker): void {
  engine.on("request-blocked", (request: { tabId?: number }) => {
    blockedTotal += 1;
    if (typeof request.tabId === "number" && request.tabId > 0) {
      blockedByWebContents.set(request.tabId, (blockedByWebContents.get(request.tabId) ?? 0) + 1);
    }
  });
}

async function cacheAgeMs(): Promise<number> {
  if (!cachePath) {
    return Number.POSITIVE_INFINITY;
  }
  try {
    const stat = await fs.stat(cachePath);
    return Date.now() - stat.mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

// Re-fetches the latest prebuilt lists (bypassing the on-disk cache), hot-swaps
// the live engine in the bound session, and rewrites the cache for the next cold
// start. Best-effort: the current engine keeps blocking if the fetch fails.
async function refreshFilterLists(): Promise<void> {
  if (!boundSession) {
    return;
  }
  try {
    const fresh = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
    applyNetworkOnlyConfig(fresh);
    trackBlockedRequests(fresh);

    const previous = blocker;
    blocker = fresh;
    if (enabled) {
      if (previous) {
        previous.disableBlockingInSession(boundSession);
      }
      fresh.enableBlockingInSession(boundSession);
    }

    if (cachePath) {
      await fs.writeFile(cachePath, fresh.serialize());
    }
  } catch {
    // Network or parse failure — keep the existing engine and retry next cycle.
  }
}

function scheduleFilterListRefresh(): void {
  if (refreshTimer) {
    return;
  }
  setTimeout(() => {
    void cacheAgeMs().then((age) => {
      if (age >= LIST_STALE_MS) {
        void refreshFilterLists();
      }
    });
  }, FIRST_REFRESH_DELAY_MS);
  refreshTimer = setInterval(() => void refreshFilterLists(), LIST_REFRESH_INTERVAL_MS);
}

/**
 * Network ad/tracker blocking for the whole default session (every tab/web
 * view). Uses Ghostery's prebuilt EasyList + EasyPrivacy engine, cached to
 * userData so subsequent launches are instant and work offline. Cosmetic
 * filtering is intentionally disabled because it injects page scripts and
 * per-page listeners that are fragile in our sandboxed WebContentsViews.
 * Fails open (browsing still works unblocked) if the lists can't be fetched on
 * first run.
 */
export async function setupAdblocker(
  targetSession: Session = electronSession.defaultSession
): Promise<void> {
  try {
    const prefs = await readPrefs();
    enabled = prefs.adblock !== false;

    cachePath = path.join(app.getPath("userData"), "andromeda-adblocker.bin");
    const engine = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: cachePath,
      read: fs.readFile,
      write: fs.writeFile
    });

    applyNetworkOnlyConfig(engine);
    trackBlockedRequests(engine);

    blocker = engine;
    boundSession = targetSession;
    if (enabled) {
      engine.enableBlockingInSession(targetSession);
    }

    // Drop a web view's per-page block count when it is destroyed, so the
    // webContents-id map cannot grow unbounded over a long session.
    app.on("web-contents-created", (_event, contents) => {
      contents.once("destroyed", () => {
        blockedByWebContents.delete(contents.id);
      });
    });

    scheduleFilterListRefresh();
  } catch {
    blocker = null;
  }
}
