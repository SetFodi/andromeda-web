/**
 * Full-snapshot backup of Andromeda's persisted state. Everything the app keeps
 * lives under the `andromeda.` localStorage namespace, so a backup is simply the
 * set of those keys serialized to a versioned envelope — and a restore only ever
 * writes keys back into that same namespace, never touching foreign storage.
 */

const BACKUP_SCHEMA = "andromeda.backup.v1";
const KEY_PREFIX = "andromeda.";

type BackupFile = {
  schema: typeof BACKUP_SCHEMA;
  exportedAt: string;
  app: string;
  data: Record<string, string>;
};

/** Serialize every `andromeda.`-prefixed localStorage entry to a backup string. */
export function exportBackup(): string {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(KEY_PREFIX)) {
      continue;
    }
    const value = localStorage.getItem(key);
    if (value !== null) {
      data[key] = value;
    }
  }

  const backup: BackupFile = {
    schema: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    app: "unknown",
    data
  };

  return JSON.stringify(backup, null, 2);
}

/** Download the current backup as a dated JSON file via a transient anchor. */
export function triggerBackupDownload(): void {
  const blob = new Blob([exportBackup()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `andromeda-backup-${date}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

/**
 * Restore a backup string. Validates the envelope, then writes back only the
 * `andromeda.`-prefixed string entries — any other key is ignored for safety.
 */
export function restoreBackup(json: string): { restored: number } {
  const parsed: unknown = JSON.parse(json);

  if (!parsed || typeof parsed !== "object" || !("schema" in parsed) || !("data" in parsed)) {
    throw new Error("Not a valid Andromeda backup");
  }
  if (parsed.schema !== BACKUP_SCHEMA || typeof parsed.data !== "object" || parsed.data === null) {
    throw new Error("Not a valid Andromeda backup");
  }

  let restored = 0;
  for (const [key, value] of Object.entries(parsed.data)) {
    if (key.startsWith(KEY_PREFIX) && typeof value === "string") {
      localStorage.setItem(key, value);
      restored += 1;
    }
  }

  return { restored };
}
