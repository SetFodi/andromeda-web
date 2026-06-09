import { app, session as electronSession, type Session } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ElectronBlocker, type Config } from "@ghostery/adblocker-electron";

let blockedCount = 0;
let active = false;

type MutableConfig = {
  -readonly [Key in keyof Config]: Config[Key];
};

export function getAdblockStats(): { active: boolean; blocked: number } {
  return { active, blocked: blockedCount };
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
    const cachePath = path.join(app.getPath("userData"), "andromeda-adblocker.bin");
    const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: cachePath,
      read: fs.readFile,
      write: fs.writeFile
    });

    const config = blocker.config as unknown as MutableConfig;
    config.loadCosmeticFilters = false;
    config.loadGenericCosmeticsFilters = false;
    config.loadExtendedSelectors = false;
    config.enableMutationObserver = false;
    config.enablePushInjectionsOnNavigationEvents = false;
    config.loadNetworkFilters = true;

    blocker.enableBlockingInSession(targetSession);
    blocker.on("request-blocked", () => {
      blockedCount += 1;
    });
    active = true;
  } catch {
    active = false;
  }
}
