import { app, BrowserWindow, shell } from "electron";

// In-app update *notifier*. Without an Apple Developer ID we can't do a silent
// Squirrel.Mac swap, so we poll GitHub for a newer release and let the renderer
// surface a "download" banner; the user re-installs with a quick drag.
const RELEASES_API = "https://api.github.com/repos/SetFodi/andromeda-web/releases/latest";
const FIRST_CHECK_DELAY_MS = 8000;
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type UpdateInfo = { version: string; url: string };

function parseVersion(value: string): number[] {
  return value
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isNewer(remote: string, current: string): boolean {
  const r = parseVersion(remote);
  const c = parseVersion(current);
  for (let i = 0; i < Math.max(r.length, c.length); i += 1) {
    const a = r[i] ?? 0;
    const b = c[i] ?? 0;
    if (a !== b) {
      return a > b;
    }
  }
  return false;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const response = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Andromeda" }
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
      draft?: boolean;
      prerelease?: boolean;
      assets?: Array<{ name: string; browser_download_url: string }>;
    };

    if (!data.tag_name || data.draft || !isNewer(data.tag_name, app.getVersion())) {
      return null;
    }

    const dmg = data.assets?.find((asset) => asset.name.toLowerCase().endsWith(".dmg"));
    return {
      version: data.tag_name.replace(/^v/i, ""),
      url: dmg?.browser_download_url ?? data.html_url ?? ""
    };
  } catch {
    return null;
  }
}

export function startUpdateChecks(window: BrowserWindow): void {
  const run = () => {
    void checkForUpdate().then((info) => {
      if (info && !window.isDestroyed()) {
        window.webContents.send("browser:updateAvailable", info);
      }
    });
  };

  setTimeout(run, FIRST_CHECK_DELAY_MS);
  setInterval(run, RECHECK_INTERVAL_MS);
}

export function openUpdateUrl(url: string): void {
  if (typeof url === "string" && /^https:\/\//.test(url)) {
    void shell.openExternal(url);
  }
}
