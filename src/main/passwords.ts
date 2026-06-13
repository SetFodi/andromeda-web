import path from "node:path";
import { promises as fs } from "node:fs";
import { app, safeStorage } from "electron";

export type SavedCredential = {
  id: string;
  origin: string;
  username: string;
  password: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
};

export type CredentialSummary = Omit<SavedCredential, "password">;

export type PendingCandidate = {
  origin: string;
  username: string;
  password: string;
  stashedAt: number;
};

type VaultData = {
  credentials: SavedCredential[];
  neverOrigins: string[];
};

const VAULT_VERSION = 1;
// A stale save prompt should not keep a password in memory forever.
const CANDIDATE_TTL_MS = 2 * 60 * 1000;

let vault: VaultData | null = null;
let loadPromise: Promise<VaultData> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
const pendingCandidates = new Map<string, PendingCandidate>();

function vaultPath(): string {
  return path.join(app.getPath("userData"), "andromeda-passwords.json");
}

export function isVaultAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

async function loadVault(): Promise<VaultData> {
  if (vault) {
    return vault;
  }

  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await fs.readFile(vaultPath(), "utf8");
        const parsed = JSON.parse(raw) as { version?: number; encrypted?: string };
        if (parsed.version === VAULT_VERSION && typeof parsed.encrypted === "string") {
          const decrypted = safeStorage.decryptString(Buffer.from(parsed.encrypted, "base64"));
          const data = JSON.parse(decrypted) as Partial<VaultData>;
          vault = {
            credentials: Array.isArray(data.credentials) ? data.credentials : [],
            neverOrigins: Array.isArray(data.neverOrigins) ? data.neverOrigins : []
          };
          return vault;
        }
      } catch {
        // Missing file (first run) or undecryptable vault (Keychain reset) —
        // start fresh either way rather than blocking the browser.
      }

      vault = { credentials: [], neverOrigins: [] };
      return vault;
    })();
  }

  return loadPromise;
}

function persistVault(): void {
  const snapshot = vault;
  if (!snapshot || !isVaultAvailable()) {
    return;
  }

  const payload = JSON.stringify({
    version: VAULT_VERSION,
    encrypted: safeStorage.encryptString(JSON.stringify(snapshot)).toString("base64")
  });

  writeQueue = writeQueue
    .then(() => fs.writeFile(vaultPath(), payload))
    .catch(() => {
      // Disk errors shouldn't crash browsing; the vault stays usable in memory.
    });
}

function createId(): string {
  return `cred-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function listCredentials(): Promise<CredentialSummary[]> {
  const data = await loadVault();
  return data.credentials
    .map(({ password: _password, ...summary }) => summary)
    .sort((a, b) => a.origin.localeCompare(b.origin) || a.username.localeCompare(b.username));
}

export type OriginCredentialMeta = {
  id: string;
  username: string;
};

/** Logins for an origin, most-recently-used first, without the passwords. */
export async function listCredentialMetaForOrigin(
  origin: string
): Promise<OriginCredentialMeta[]> {
  const data = await loadVault();
  return data.credentials
    .filter((credential) => credential.origin === origin)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .map((credential) => ({ id: credential.id, username: credential.username }));
}

/**
 * Returns one login's secret for filling, but only when the credential really
 * belongs to the requesting origin — the page can never pull another site's
 * password by id. Marks it used so it floats to the top next time.
 */
export async function getFillCredentialById(
  id: string,
  origin: string
): Promise<{ username: string; password: string } | null> {
  const data = await loadVault();
  const credential = data.credentials.find((entry) => entry.id === id);
  if (!credential || credential.origin !== origin) {
    return null;
  }

  credential.lastUsedAt = Date.now();
  persistVault();
  return { username: credential.username, password: credential.password };
}

export async function revealPassword(id: string): Promise<string | null> {
  const data = await loadVault();
  return data.credentials.find((credential) => credential.id === id)?.password ?? null;
}

export async function deleteCredential(id: string): Promise<void> {
  const data = await loadVault();
  const next = data.credentials.filter((credential) => credential.id !== id);
  if (next.length !== data.credentials.length) {
    data.credentials = next;
    persistVault();
  }
}

export async function isNeverOrigin(origin: string): Promise<boolean> {
  const data = await loadVault();
  return data.neverOrigins.includes(origin);
}

export async function listNeverOrigins(): Promise<string[]> {
  const data = await loadVault();
  return [...data.neverOrigins].sort();
}

export async function removeNeverOrigin(origin: string): Promise<void> {
  const data = await loadVault();
  const next = data.neverOrigins.filter((entry) => entry !== origin);
  if (next.length !== data.neverOrigins.length) {
    data.neverOrigins = next;
    persistVault();
  }
}

/**
 * Classifies a captured login so the caller can decide whether to prompt.
 * "known" means we already hold this exact origin+username+password.
 */
export async function classifyCandidate(
  origin: string,
  username: string,
  password: string
): Promise<"never" | "known" | "update" | "new"> {
  const data = await loadVault();
  if (data.neverOrigins.includes(origin)) {
    return "never";
  }

  const existing = data.credentials.find(
    (credential) => credential.origin === origin && credential.username === username
  );
  if (!existing) {
    return "new";
  }

  if (existing.password === password) {
    existing.lastUsedAt = Date.now();
    persistVault();
    return "known";
  }

  return "update";
}

export function stashCandidate(origin: string, username: string, password: string): void {
  pendingCandidates.set(origin, { origin, username, password, stashedAt: Date.now() });
}

export function takeCandidate(origin: string): PendingCandidate | null {
  const candidate = pendingCandidates.get(origin) ?? null;
  pendingCandidates.delete(origin);
  if (!candidate || Date.now() - candidate.stashedAt > CANDIDATE_TTL_MS) {
    return null;
  }
  return candidate;
}

export function dropCandidate(origin: string): void {
  pendingCandidates.delete(origin);
}

export async function saveCandidate(origin: string): Promise<boolean> {
  const candidate = takeCandidate(origin);
  if (!candidate || !isVaultAvailable()) {
    return false;
  }

  const data = await loadVault();
  const now = Date.now();
  const existing = data.credentials.find(
    (credential) => credential.origin === origin && credential.username === candidate.username
  );

  if (existing) {
    existing.password = candidate.password;
    existing.updatedAt = now;
    existing.lastUsedAt = now;
  } else {
    data.credentials.push({
      id: createId(),
      origin,
      username: candidate.username,
      password: candidate.password,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now
    });
  }

  persistVault();
  return true;
}

export async function neverForOrigin(origin: string): Promise<void> {
  dropCandidate(origin);
  const data = await loadVault();
  if (!data.neverOrigins.includes(origin)) {
    data.neverOrigins.push(origin);
    persistVault();
  }
}
