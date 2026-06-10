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

    const cachePath = path.join(app.getPath("userData"), "andromeda-adblocker.bin");
    const engine = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: cachePath,
      read: fs.readFile,
      write: fs.writeFile
    });

    const config = engine.config as unknown as MutableConfig;
    config.loadCosmeticFilters = false;
    config.loadGenericCosmeticsFilters = false;
    config.loadExtendedSelectors = false;
    config.enableMutationObserver = false;
    config.enablePushInjectionsOnNavigationEvents = false;
    config.loadNetworkFilters = true;

    engine.on("request-blocked", (request: { tabId?: number }) => {
      blockedTotal += 1;
      if (typeof request.tabId === "number" && request.tabId > 0) {
        blockedByWebContents.set(request.tabId, (blockedByWebContents.get(request.tabId) ?? 0) + 1);
      }
    });

    blocker = engine;
    boundSession = targetSession;
    if (enabled) {
      engine.enableBlockingInSession(targetSession);
    }
  } catch {
    blocker = null;
  }
}
