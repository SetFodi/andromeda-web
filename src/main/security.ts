import { BrowserWindow, dialog, session as electronSession, type Session } from "electron";

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

const SAFE_PERMISSIONS = new Set(["fullscreen", "pointerLock"]);

const grants = new Set<string>();
const pendingPrompts = new Map<string, Promise<boolean>>();

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
      detail: "Andromeda remembers this until you quit. Only allow it if you trust the site."
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
        }
        callback(allowed);
      })
      .catch(() => callback(false));
  });

  targetSession.setDevicePermissionHandler(() => false);
}
