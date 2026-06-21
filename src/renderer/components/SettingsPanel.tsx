import { memo, useEffect, useRef, useState, type ChangeEvent } from "react";
import Icon from "./Icon";
import { SEARCH_ENGINES, SearchEngineId } from "../utils/url";
import { restoreBackup, triggerBackupDownload } from "../utils/backup";
import {
  TOOLBAR_BUTTON_KEYS,
  type Settings,
  type SettingsPatch,
  type ToolbarButtonKey
} from "../state/useSettings";

type SettingsPanelProps = {
  isOpen: boolean;
  settings: Settings;
  onUpdateSettings: (patch: SettingsPatch) => void;
  onClearBrowsingData: () => void;
  onImportFromChrome: () => Promise<{
    pages: number;
    shortcuts: number;
    passwords: number;
    passwordsFound: number;
  }>;
  onClose: () => void;
};

const SEARCH_OPTIONS = (Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map((id) => ({
  id,
  label: SEARCH_ENGINES[id].label
}));

const TOOLBAR_BUTTON_LABELS: Record<ToolbarButtonKey, string> = {
  bookmark: "Bookmark",
  split: "Split view",
  downloads: "Downloads",
  reader: "Reader",
  siteInfo: "Site info"
};

type ImportState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; pages: number; shortcuts: number; passwords: number; passwordsFound: number }
  | { phase: "error" };

type BackupStatus =
  | { kind: "idle" }
  | { kind: "exported" }
  | { kind: "restored"; count: number }
  | { kind: "error" };

function SettingsPanel({
  isOpen,
  settings,
  onUpdateSettings,
  onClearBrowsingData,
  onImportFromChrome,
  onClose
}: SettingsPanelProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [shield, setShield] = useState<ShieldStats | null>(null);
  const [version, setVersion] = useState("");
  const [clearArmed, setClearArmed] = useState(false);
  const [didClear, setDidClear] = useState(false);
  const [passwords, setPasswords] = useState<CredentialSummary[] | null>(null);
  const [passwordsAvailable, setPasswordsAvailable] = useState(true);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [revealedValue, setRevealedValue] = useState("");
  const [chromeAvailable, setChromeAvailable] = useState(false);
  const [importState, setImportState] = useState<ImportState>({ phase: "idle" });
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({ kind: "idle" });
  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => nameRef.current?.focus());
    } else {
      setClearArmed(false);
      setDidClear(false);
      setRevealedId(null);
      setRevealedValue("");
      setImportState({ phase: "idle" });
      setBackupStatus({ kind: "idle" });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    void window.andromeda.getShieldStats().then((stats) => {
      if (!cancelled) {
        setShield(stats);
      }
    });
    void window.andromeda.getAppInfo().then((info) => {
      if (!cancelled) {
        setVersion(info.version);
      }
    });
    void window.andromeda.listPasswords().then((entries) => {
      if (!cancelled) {
        setPasswords(entries);
      }
    });
    void window.andromeda.passwordsAvailable().then((available) => {
      if (!cancelled) {
        setPasswordsAvailable(available);
      }
    });
    void window.andromeda.importAvailable().then((available) => {
      if (!cancelled) {
        setChromeAvailable(available);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleImport = () => {
    setImportState({ phase: "running" });
    onImportFromChrome().then(
      (result) => {
        setImportState({ phase: "done", ...result });
        // Refresh the saved-password list so imported logins show immediately.
        void window.andromeda.listPasswords().then(setPasswords);
      },
      () => setImportState({ phase: "error" })
    );
  };

  if (!isOpen) {
    return null;
  }

  const handleToggleShield = () => {
    if (!shield) {
      return;
    }
    const next = !shield.enabled;
    setShield({ ...shield, enabled: next });
    void window.andromeda.setAdblockEnabled(next);
  };

  const handleClear = () => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    onClearBrowsingData();
    setClearArmed(false);
    setDidClear(true);
    window.setTimeout(() => setDidClear(false), 2200);
  };

  const handleBackup = () => {
    triggerBackupDownload();
    setBackupStatus({ kind: "exported" });
  };

  const handleRestoreClick = () => {
    backupInputRef.current?.click();
  };

  const handleRestoreFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still fires a change event.
    event.target.value = "";
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === "string" ? reader.result : "";
        const { restored } = restoreBackup(text);
        setBackupStatus({ kind: "restored", count: restored });
        window.setTimeout(() => window.location.reload(), 600);
      } catch {
        setBackupStatus({ kind: "error" });
      }
    };
    reader.onerror = () => setBackupStatus({ kind: "error" });
    reader.readAsText(file);
  };

  const handleToggleReveal = (id: string) => {
    if (revealedId === id) {
      setRevealedId(null);
      setRevealedValue("");
      return;
    }

    void window.andromeda.revealPassword(id).then((value) => {
      // Null means the keychain/Touch ID prompt was cancelled — stay hidden.
      if (value == null) {
        return;
      }
      setRevealedId(id);
      setRevealedValue(value);
    });
  };

  const handleDeletePassword = (id: string) => {
    void window.andromeda.deletePassword(id);
    setPasswords((current) => current?.filter((entry) => entry.id !== id) ?? current);
    if (revealedId === id) {
      setRevealedId(null);
      setRevealedValue("");
    }
  };

  const hostFromOrigin = (origin: string) => {
    try {
      return new URL(origin).hostname.replace(/^www\./, "");
    } catch {
      return origin;
    }
  };

  return (
    <div className="settings-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <header className="settings-head">
          <h2>Settings</h2>
          <button className="settings-close" type="button" aria-label="Close settings" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="settings-body">
          <div className="settings-field">
            <label htmlFor="settings-name">Your name</label>
            <p className="settings-hint">Used in the start page greeting and profile badge.</p>
            <input
              id="settings-name"
              ref={nameRef}
              className="settings-input"
              value={settings.name}
              spellCheck={false}
              placeholder="Your name"
              maxLength={40}
              onChange={(event) => onUpdateSettings({ name: event.target.value })}
            />
          </div>

          <div className="settings-field">
            <label>Default search engine</label>
            <div className="settings-segment">
              {SEARCH_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={
                    settings.searchEngine === option.id
                      ? "settings-seg-btn is-active"
                      : "settings-seg-btn"
                  }
                  onClick={() => onUpdateSettings({ searchEngine: option.id })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {chromeAvailable ? (
            <div className="settings-field">
              <label>Import from Chrome</label>
              <div className="settings-row">
                <span className="settings-row-copy">
                  <span>Bring over your data</span>
                  <small>
                    {importState.phase === "done"
                      ? `Imported ${importState.passwords} password${importState.passwords === 1 ? "" : "s"}, ${importState.pages} page${importState.pages === 1 ? "" : "s"}, ${importState.shortcuts} shortcut${importState.shortcuts === 1 ? "" : "s"}.`
                      : importState.phase === "error"
                        ? "Import failed — make sure Chrome is closed and try again."
                        : "Bookmarks, history and saved passwords. Asks your keychain once."}
                  </small>
                </span>
                <button
                  type="button"
                  className="settings-clear"
                  disabled={importState.phase === "running"}
                  onClick={handleImport}
                >
                  {importState.phase === "running"
                    ? "Importing…"
                    : importState.phase === "done"
                      ? "Done"
                      : "Import"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="settings-field">
            <label>Address bar</label>
            <p className="settings-hint">Keep search in the top bar, or move it into the sidebar.</p>
            <div className="settings-segment">
              <button
                type="button"
                className={
                  settings.addressBarPlacement === "toolbar"
                    ? "settings-seg-btn is-active"
                    : "settings-seg-btn"
                }
                onClick={() => onUpdateSettings({ addressBarPlacement: "toolbar" })}
              >
                Top bar
              </button>
              <button
                type="button"
                className={
                  settings.addressBarPlacement === "sidebar"
                    ? "settings-seg-btn is-active"
                    : "settings-seg-btn"
                }
                onClick={() => onUpdateSettings({ addressBarPlacement: "sidebar" })}
              >
                Sidebar
              </button>
            </div>
          </div>

          <div className="settings-field">
            <label>Toolbar buttons</label>
            <p className="settings-hint">Hide the ones you don&apos;t use for a cleaner top bar.</p>
            <div className="settings-chips">
              {TOOLBAR_BUTTON_KEYS.map((key) => {
                const on = settings.toolbarButtons[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className={on ? "settings-chip is-on" : "settings-chip"}
                    aria-pressed={on}
                    onClick={() => onUpdateSettings({ toolbarButtons: { [key]: !on } })}
                  >
                    {on ? <Icon name="check" size={13} /> : <Icon name="close" size={13} />}
                    {TOOLBAR_BUTTON_LABELS[key]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-field">
            <label>Shield</label>
            <div className="settings-row">
              <span className="settings-row-copy">
                <span>Block ads &amp; trackers</span>
                <small>
                  {shield?.active
                    ? `${shield.blockedTotal.toLocaleString()} requests blocked since launch`
                    : "Filter lists are still loading"}
                </small>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={shield?.enabled ?? false}
                aria-label="Block ads and trackers"
                className={shield?.enabled ? "settings-switch is-on" : "settings-switch"}
                disabled={!shield?.active}
                onClick={handleToggleShield}
              >
                <span className="settings-switch-knob" />
              </button>
            </div>
          </div>

          <div className="settings-field">
            <label>Passwords</label>
            {!passwordsAvailable ? (
              <p className="settings-hint">
                Saving passwords needs the system keychain, which isn&apos;t available right now.
              </p>
            ) : passwords && passwords.length > 0 ? (
              <div className="settings-pw-list">
                {passwords.map((credential) => (
                  <div className="settings-pw-row" key={credential.id}>
                    <span className="settings-row-copy">
                      <span>{hostFromOrigin(credential.origin)}</span>
                      <small>
                        {credential.username || "No username"}
                        {revealedId === credential.id ? (
                          <code className="settings-pw-secret">{revealedValue}</code>
                        ) : null}
                      </small>
                    </span>
                    <span className="settings-pw-actions">
                      <button
                        type="button"
                        className="settings-pw-btn"
                        onClick={() => handleToggleReveal(credential.id)}
                      >
                        {revealedId === credential.id ? "Hide" : "Show"}
                      </button>
                      <button
                        type="button"
                        className="settings-pw-btn is-danger"
                        aria-label={`Delete password for ${hostFromOrigin(credential.origin)}`}
                        onClick={() => handleDeletePassword(credential.id)}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="settings-hint">
                Logins you save will appear here, encrypted with your Mac&apos;s keychain.
              </p>
            )}
          </div>

          <div className="settings-field">
            <label>Privacy</label>
            <div className="settings-row">
              <span className="settings-row-copy">
                <span>Clear browsing data</span>
                <small>Removes history, cache and site data. Keeps logins.</small>
              </span>
              <button
                type="button"
                className={clearArmed ? "settings-clear is-armed" : "settings-clear"}
                onClick={handleClear}
              >
                {didClear ? "Cleared" : clearArmed ? "Confirm" : "Clear…"}
              </button>
            </div>
          </div>

          <div className="settings-field">
            <label>Backup</label>
            <p className="settings-hint">
              Saves your spaces, tabs, bookmarks, history and settings to a file.
            </p>
            <div className="settings-row">
              <span className="settings-row-copy">
                <span>Back up everything</span>
                <small>
                  {backupStatus.kind === "exported"
                    ? "Backup downloaded."
                    : "Download a copy of everything to your Mac."}
                </small>
              </span>
              <button type="button" className="settings-clear" onClick={handleBackup}>
                Back up
              </button>
            </div>
            <div className="settings-row">
              <span className="settings-row-copy">
                <span>Restore from backup</span>
                <small>
                  {backupStatus.kind === "restored"
                    ? `Restored ${backupStatus.count} item${backupStatus.count === 1 ? "" : "s"} — reloading…`
                    : backupStatus.kind === "error"
                      ? "That file isn’t a valid Andromeda backup."
                      : "Replace your data with a saved backup file."}
                </small>
              </span>
              <button type="button" className="settings-clear" onClick={handleRestoreClick}>
                Restore…
              </button>
            </div>
            <input
              ref={backupInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={handleRestoreFile}
            />
          </div>
        </div>

        <footer className="settings-foot">
          <span>Andromeda · {version || "—"}</span>
          <button className="settings-done" type="button" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

export default memo(SettingsPanel);
