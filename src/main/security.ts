import path from "node:path";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { app, BrowserWindow, desktopCapturer, dialog, session as electronSession, type Session } from "electron";

const ASKED_PERMISSIONS = new Set([
  "clipboard-read",
  "display-capture",
  "geolocation",
  "media",
  "midi",
  "midiSysex",
  "notifications",
  "pointerLock",
  "fullscreen"
]);

// display-capture is auto-granted here because the screen/window picker shown by
// setDisplayMediaRequestHandler (below) is itself the user's consent step.
const SAFE_PERMISSIONS = new Set(["fullscreen", "pointerLock", "display-capture"]);

const grants = new Set<string>();
const pendingPrompts = new Map<string, Promise<boolean>>();

// Site permission grants persist across launches (like Chrome/Arc), so a site
// you've trusted isn't re-prompted every restart. Stored as a flat JSON array
// of "origin:permission" keys in userData; atomic write, quarantine-on-corrupt.
let grantsLoaded = false;
function grantsPath(): string {
  return path.join(app.getPath("userData"), "andromeda-permissions.json");
}
function loadGrants(): void {
  if (grantsLoaded) {
    return;
  }
  grantsLoaded = true;
  let raw: string;
  try {
    raw = readFileSync(grantsPath(), "utf8");
  } catch {
    return; // first run — no file yet
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const key of parsed) {
        if (typeof key === "string" && key.includes(":")) {
          grants.add(key);
        }
      }
    }
  } catch {
    // Corrupt — preserve for inspection rather than silently dropping it.
    try {
      renameSync(grantsPath(), `${grantsPath()}.corrupt-${Date.now()}`);
    } catch {
      // best-effort
    }
  }
}
function persistGrants(): void {
  const finalPath = grantsPath();
  const tmpPath = `${finalPath}.tmp`;
  try {
    writeFileSync(tmpPath, JSON.stringify([...grants]));
    renameSync(tmpPath, finalPath); // atomic swap — a crash mid-write can't corrupt
  } catch {
    // best-effort — a failed persist just means re-prompting next launch
  }
}

function originFromUrl(rawUrl?: string): string | null {
  if (!rawUrl) {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function grantKey(origin: string, permission: string): string {
  return `${origin}:${permission}`;
}

export function getOriginFromUrl(rawUrl?: string): string | null {
  return originFromUrl(rawUrl);
}

export function listPermissionGrants(origin: string): string[] {
  const prefix = `${origin}:`;
  return [...grants].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
}

export function revokePermissionGrant(origin: string, permission: string): void {
  grants.delete(grantKey(origin, permission));
  persistGrants();
}

function describePermission(permission: string, details: Electron.PermissionRequest): string {
  const mediaTypes = "mediaTypes" in details ? details.mediaTypes : undefined;
  if (permission === "media" && Array.isArray(mediaTypes) && mediaTypes.length > 0) {
    return mediaTypes.join(" and ");
  }

  if (permission === "display-capture") {
    return "screen recording";
  }

  if (permission === "clipboard-read") {
    return "clipboard access";
  }

  return permission.replace(/-/g, " ");
}

async function askUser(
  window: BrowserWindow,
  origin: string,
  permission: string,
  details: Electron.PermissionRequest
): Promise<boolean> {
  const key = grantKey(origin, permission);
  const existingPrompt = pendingPrompts.get(key);
  if (existingPrompt) {
    return existingPrompt;
  }

  const prompt = dialog
    .showMessageBox(window, {
      type: "question",
      buttons: ["Allow", "Deny"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: "Permission request",
      message: `${origin} wants ${describePermission(permission, details)}.`,
      detail: "Andromeda remembers this for this site. Only allow it if you trust the site."
    })
    .then(({ response }) => response === 0)
    .finally(() => pendingPrompts.delete(key));

  pendingPrompts.set(key, prompt);
  return prompt;
}

export function setupSecurityPolicy(
  window: BrowserWindow,
  targetSession: Session = electronSession.defaultSession
): void {
  loadGrants();

  targetSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    const origin = originFromUrl(requestingOrigin);
    if (!origin) {
      return false;
    }

    return grants.has(grantKey(origin, permission));
  });

  targetSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = originFromUrl(details.requestingUrl ?? webContents.getURL());
    if (!origin || !ASKED_PERMISSIONS.has(permission)) {
      callback(false);
      return;
    }

    if (SAFE_PERMISSIONS.has(permission)) {
      grants.add(grantKey(origin, permission));
      callback(true);
      return;
    }

    const key = grantKey(origin, permission);
    if (grants.has(key)) {
      callback(true);
      return;
    }

    void askUser(window, origin, permission, details)
      .then((allowed) => {
        if (allowed) {
          grants.add(key);
          persistGrants();
        }
        callback(allowed);
      })
      .catch(() => callback(false));
  });

  targetSession.setDevicePermissionHandler(() => false);

  // Screen / window sharing (getDisplayMedia — Google Meet, Zoom-web, Figma
  // "present"). Prefer the native macOS picker when available; otherwise fall
  // back to a desktopCapturer source so capture still works on older macOS.
  targetSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ["screen", "window"] })
        .then((sources) => {
          if (sources.length > 0) {
            callback({ video: sources[0] });
          } else {
            callback({});
          }
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: true }
  );
}
