import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ImportedBookmark = { title: string; url: string };
export type ImportedHistory = {
  url: string;
  title: string;
  visitCount: number;
  lastVisited: number;
};
export type ImportedPassword = { origin: string; username: string; password: string };

function chromeUserDir(): string {
  return path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome");
}

// Prefer the Default profile; fall back to the first "Profile N" that has data.
async function resolveProfileDir(): Promise<string | null> {
  const base = chromeUserDir();
  const candidates = ["Default", "Profile 1", "Profile 2", "Profile 3"];
  for (const name of candidates) {
    const dir = path.join(base, name);
    try {
      await fs.access(path.join(dir, "Bookmarks"));
      return dir;
    } catch {
      // try the next; Bookmarks is the most reliable signal a profile is real
    }
    try {
      await fs.access(path.join(dir, "History"));
      return dir;
    } catch {
      // keep looking
    }
  }
  return null;
}

export async function isChromeAvailable(): Promise<boolean> {
  return (await resolveProfileDir()) !== null;
}

// ---- Bookmarks ---------------------------------------------------------
type ChromeBookmarkNode = {
  type?: string;
  url?: string;
  name?: string;
  children?: ChromeBookmarkNode[];
};

function collectBookmarks(node: ChromeBookmarkNode | undefined, out: ImportedBookmark[]): void {
  if (!node) {
    return;
  }
  if (node.type === "url" && typeof node.url === "string" && /^https?:\/\//.test(node.url)) {
    out.push({ title: node.name?.trim() || node.url, url: node.url });
  }
  for (const child of node.children ?? []) {
    collectBookmarks(child, out);
  }
}

export async function readChromeBookmarks(): Promise<ImportedBookmark[]> {
  const profile = await resolveProfileDir();
  if (!profile) {
    return [];
  }

  try {
    const raw = await fs.readFile(path.join(profile, "Bookmarks"), "utf8");
    const data = JSON.parse(raw) as { roots?: Record<string, ChromeBookmarkNode> };
    const out: ImportedBookmark[] = [];
    // Bookmark bar first (the user's most-reached set), then other folders.
    collectBookmarks(data.roots?.bookmark_bar, out);
    collectBookmarks(data.roots?.other, out);
    // De-dupe by URL, keep first occurrence (bar wins over other).
    const seen = new Set<string>();
    return out.filter((b) => (seen.has(b.url) ? false : (seen.add(b.url), true)));
  } catch {
    return [];
  }
}

// ---- sqlite helper -----------------------------------------------------
// Chrome keeps History / Login Data locked while running, so we work on a copy
// and read it with the system sqlite3. Rows are unit-separated to survive URLs.
async function querySqlite(dbPath: string, query: string): Promise<string[][]> {
  const tmp = path.join(os.tmpdir(), `andromeda-import-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    await fs.copyFile(dbPath, tmp);
  } catch {
    return [];
  }

  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/sqlite3",
      ["-newline", "", "-separator", "", tmp, query],
      { maxBuffer: 64 * 1024 * 1024 }
    );
    return stdout
      .split("")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(""));
  } catch {
    return [];
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
  }
}

// Chrome timestamps are microseconds since 1601-01-01; convert to JS epoch ms.
function chromeTimeToMs(value: string): number {
  const micros = Number(value);
  if (!Number.isFinite(micros) || micros <= 0) {
    return Date.now();
  }
  return Math.round(micros / 1000 - 11644473600000);
}

export async function readChromeHistory(limit = 2000): Promise<ImportedHistory[]> {
  const profile = await resolveProfileDir();
  if (!profile) {
    return [];
  }

  const rows = await querySqlite(
    path.join(profile, "History"),
    `SELECT url, title, visit_count, last_visit_time FROM urls
     WHERE url LIKE 'http%' ORDER BY last_visit_time DESC LIMIT ${Math.max(1, Math.min(limit, 5000))};`
  );

  return rows
    .filter((cols) => cols.length >= 4 && /^https?:\/\//.test(cols[0]))
    .map((cols) => ({
      url: cols[0],
      title: cols[1] || cols[0],
      visitCount: Number(cols[2]) || 1,
      lastVisited: chromeTimeToMs(cols[3])
    }));
}

// ---- Passwords ---------------------------------------------------------
let cachedKey: Buffer | null | undefined;

// The AES key Chrome uses on macOS is derived from a random secret it stores in
// the login keychain under service "Chrome Safe Storage". Reading it triggers a
// one-time keychain permission prompt for the user.
async function getChromeAesKey(): Promise<Buffer | null> {
  if (cachedKey !== undefined) {
    return cachedKey;
  }
  try {
    const { stdout } = await execFileAsync("/usr/bin/security", [
      "find-generic-password",
      "-ws",
      "Chrome Safe Storage"
    ]);
    const secret = stdout.trim();
    if (!secret) {
      cachedKey = null;
      return null;
    }
    cachedKey = crypto.pbkdf2Sync(secret, "saltysalt", 1003, 16, "sha1");
    return cachedKey;
  } catch {
    cachedKey = null;
    return null;
  }
}

function decryptChromePassword(blobHex: string, key: Buffer): string | null {
  try {
    const blob = Buffer.from(blobHex, "hex");
    // macOS Chrome prefixes encrypted values with "v10".
    if (blob.length <= 3 || blob.subarray(0, 3).toString("ascii") !== "v10") {
      return null;
    }
    const iv = Buffer.alloc(16, 0x20); // 16 spaces
    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
    decipher.setAutoPadding(true);
    const out = Buffer.concat([decipher.update(blob.subarray(3)), decipher.final()]);
    const text = out.toString("utf8");
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

export async function readChromePasswords(): Promise<ImportedPassword[]> {
  const profile = await resolveProfileDir();
  if (!profile) {
    return [];
  }

  const key = await getChromeAesKey();
  if (!key) {
    return [];
  }

  const rows = await querySqlite(
    path.join(profile, "Login Data"),
    `SELECT origin_url, username_value, hex(password_value) FROM logins WHERE blacklisted_by_user = 0;`
  );

  const out: ImportedPassword[] = [];
  for (const cols of rows) {
    if (cols.length < 3) {
      continue;
    }
    const [originUrl, username, passwordHex] = cols;
    let origin: string;
    try {
      origin = new URL(originUrl).origin;
    } catch {
      continue;
    }
    if (origin.startsWith("android://")) {
      continue;
    }
    const password = decryptChromePassword(passwordHex, key);
    if (!password) {
      continue;
    }
    out.push({ origin, username: username ?? "", password });
  }
  return out;
}
