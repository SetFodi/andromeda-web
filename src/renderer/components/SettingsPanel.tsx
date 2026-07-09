import { memo, useEffect, useRef, useState, type ChangeEvent } from "react";
import AndromedaMark from "./AndromedaMark";
import Icon, { type IconName } from "./Icon";
import { SEARCH_ENGINES, type SearchEngineId } from "../utils/url";
import { inspectBackup, restoreBackup, triggerBackupDownload } from "../utils/backup";
import type { ThemeMode } from "../state/useTheme";
import {
  TOOLBAR_BUTTON_KEYS,
  type Settings,
  type SettingsPatch,
  type ToolbarButtonKey
} from "../state/useSettings";

type SettingsPanelProps = {
  isOpen: boolean;
  settings: Settings;
  theme: ThemeMode;
  accent: string;
  backgroundGlowEnabled: boolean;
  onSetTheme: (mode: ThemeMode) => void;
  onPickAccent: (hex: string) => void;
  onToggleBackgroundGlow: () => void;
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
  bookmark: "Pin to Start",
  split: "Split view",
  downloads: "Downloads",
  reader: "Reader",
  siteInfo: "Site info"
};

const THEME_OPTIONS: Array<{ id: ThemeMode; label: string; hint: string }> = [
  { id: "glow", label: "Glow", hint: "Ambient color" },
  { id: "day", label: "Day", hint: "Warm and bright" },
  { id: "night", label: "Night", hint: "Quiet contrast" }
];

const ACCENT_OPTIONS = [
  { hex: "#f28366", label: "Coral" },
  { hex: "#f4a23b", label: "Amber" },
  { hex: "#41a96c", label: "Fern" },
  { hex: "#3bb0c9", label: "Lagoon" },
  { hex: "#4f7df4", label: "Orbit" },
  { hex: "#7c5cff", label: "Violet" },
  { hex: "#e0567f", label: "Rose" },
  { hex: "#8a8f98", label: "Graphite" }
];

type SettingsSection = "general" | "appearance" | "privacy" | "data";

const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  hint: string;
  icon: IconName;
}> = [
  { id: "general", label: "General", hint: "Search and layout", icon: "grid" },
  { id: "appearance", label: "Appearance", hint: "Theme and toolbar", icon: "sparkle" },
  { id: "privacy", label: "Privacy", hint: "Shield and passwords", icon: "shield" },
  { id: "data", label: "Your data", hint: "Import and backup", icon: "download" }
];

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

type PendingRestore = {
  text: string;
  items: number;
  exportedAt: string | null;
};

function SettingsPanel({
  isOpen,
  settings,
  theme,
  accent,
  backgroundGlowEnabled,
  onSetTheme,
  onPickAccent,
  onToggleBackgroundGlow,
  onUpdateSettings,
  onClearBrowsingData,
  onImportFromChrome,
  onClose
}: SettingsPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const activeNavRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const confirmRestoreRef = useRef<HTMLButtonElement>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const [shield, setShield] = useState<ShieldStats | null>(null);
  const [version, setVersion] = useState("");
  const [clearArmed, setClearArmed] = useState(false);
  const [didClear, setDidClear] = useState(false);
  const [passwords, setPasswords] = useState<CredentialSummary[] | null>(null);
  const [passwordsAvailable, setPasswordsAvailable] = useState(true);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [revealedValue, setRevealedValue] = useState("");
  const [chromeAvailable, setChromeAvailable] = useState<boolean | null>(null);
  const [importState, setImportState] = useState<ImportState>({ phase: "idle" });
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({ kind: "idle" });
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setActiveSection("general");
      setClearArmed(false);
      setDidClear(false);
      setRevealedId(null);
      setRevealedValue("");
      setImportState({ phase: "idle" });
      setBackupStatus({ kind: "idle" });
      setPendingRestore(null);
      return;
    }

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => activeNavRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      previouslyFocusedRef.current?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    void window.andromeda.getShieldStats().then((stats) => !cancelled && setShield(stats));
    void window.andromeda.getAppInfo().then((info) => !cancelled && setVersion(info.version));
    void window.andromeda.listPasswords().then((entries) => !cancelled && setPasswords(entries));
    void window.andromeda.passwordsAvailable().then((available) => !cancelled && setPasswordsAvailable(available));
    void window.andromeda.importAvailable().then((available) => !cancelled && setChromeAvailable(available));

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (pendingRestore) {
      requestAnimationFrame(() => confirmRestoreRef.current?.focus({ preventScroll: true }));
    }
  }, [pendingRestore]);

  if (!isOpen) {
    return null;
  }

  const handleImport = () => {
    setImportState({ phase: "running" });
    onImportFromChrome().then(
      (result) => {
        setImportState({ phase: "done", ...result });
        void window.andromeda.listPasswords().then(setPasswords);
      },
      () => setImportState({ phase: "error" })
    );
  };

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

  const handleRestoreFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === "string" ? reader.result : "";
        const preview = inspectBackup(text);
        setPendingRestore({ text, ...preview });
      } catch {
        setBackupStatus({ kind: "error" });
      }
    };
    reader.onerror = () => setBackupStatus({ kind: "error" });
    reader.readAsText(file);
  };

  const handleConfirmRestore = () => {
    if (!pendingRestore) {
      return;
    }
    try {
      const { restored } = restoreBackup(pendingRestore.text);
      setPendingRestore(null);
      setBackupStatus({ kind: "restored", count: restored });
      window.setTimeout(() => window.location.reload(), 600);
    } catch {
      setPendingRestore(null);
      setBackupStatus({ kind: "error" });
    }
  };

  const handleToggleReveal = (id: string) => {
    if (revealedId === id) {
      setRevealedId(null);
      setRevealedValue("");
      return;
    }

    void window.andromeda.revealPassword(id).then((value) => {
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

  const activeMeta = SETTINGS_SECTIONS.find((section) => section.id === activeSection)!;

  return (
    <div className="settings-layer" role="presentation" onMouseDown={onClose}>
      <section
        ref={panelRef}
        className="settings-panel settings-workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (pendingRestore) {
              setPendingRestore(null);
            } else {
              onClose();
            }
            return;
          }
          if (event.key !== "Tab") {
            return;
          }
          const focusable = Array.from(
            panelRef.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
            ) ?? []
          );
          if (focusable.length === 0) {
            return;
          }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <aside className="settings-nav" aria-label="Settings sections">
          <div className="settings-brand">
            <span className="settings-brand-mark"><AndromedaMark size={28} /></span>
            <span><b>Andromeda</b><small>Preferences</small></span>
          </div>
          <nav className="settings-nav-list">
            {SETTINGS_SECTIONS.map((section) => (
              <button
                key={section.id}
                ref={section.id === activeSection ? activeNavRef : undefined}
                type="button"
                className={section.id === activeSection ? "settings-nav-item is-active" : "settings-nav-item"}
                aria-current={section.id === activeSection ? "page" : undefined}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="settings-nav-icon"><Icon name={section.icon} size={16} /></span>
                <span><b>{section.label}</b><small>{section.hint}</small></span>
                <Icon name="chevronRight" size={14} />
              </button>
            ))}
          </nav>
          <div className="settings-nav-foot">
            <span className="settings-saved-dot" aria-hidden="true" />
            Saved automatically
          </div>
        </aside>

        <div className="settings-main">
          <header className="settings-head">
            <div>
              <span className="settings-eyebrow">{activeMeta.hint}</span>
              <h2 id="settings-title">{activeMeta.label}</h2>
            </div>
            <button className="settings-close" type="button" aria-label="Close settings" onClick={onClose}>
              <Icon name="close" size={16} />
            </button>
          </header>

          <div className="settings-body" aria-live="polite">
            {activeSection === "general" ? (
              <>
                <section className="settings-section-intro">
                  <h3>Your browser, your rhythm.</h3>
                  <p>Choose how Andromeda greets you and where the controls you use most should live.</p>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <span className="settings-card-icon"><Icon name="user" size={16} /></span>
                    <span><b>Profile</b><small>Personalizes the start page greeting.</small></span>
                  </div>
                  <label className="settings-control-label" htmlFor="settings-name">Your name</label>
                  <input
                    id="settings-name"
                    className="settings-input"
                    value={settings.name}
                    spellCheck={false}
                    placeholder="What should Andromeda call you?"
                    maxLength={40}
                    onChange={(event) => onUpdateSettings({ name: event.target.value })}
                  />
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <span className="settings-card-icon"><Icon name="search" size={16} /></span>
                    <span><b>Default search</b><small>Used for anything that is not a web address.</small></span>
                  </div>
                  <div className="settings-radio-list" role="radiogroup" aria-label="Default search engine">
                    {SEARCH_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={settings.searchEngine === option.id}
                        className={settings.searchEngine === option.id ? "settings-radio is-active" : "settings-radio"}
                        onClick={() => onUpdateSettings({ searchEngine: option.id })}
                      >
                        <span className={`settings-engine-mark is-${option.id}`}>{option.label.charAt(0)}</span>
                        <span>{option.label}</span>
                        <span className="settings-radio-check"><Icon name="check" size={12} /></span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <span className="settings-card-icon"><Icon name="panel" size={16} /></span>
                    <span><b>Browser layout</b><small>Go spatial with the sidebar or stay classic.</small></span>
                  </div>
                  <div className="settings-choice-grid">
                    <button
                      type="button"
                      className={settings.layout === "sidebar" ? "settings-choice is-active" : "settings-choice"}
                      aria-pressed={settings.layout === "sidebar"}
                      onClick={() => onUpdateSettings({ layout: "sidebar" })}
                    >
                      <span className="settings-layout-preview is-sidebar"><i /><i /><i /></span>
                      <span><b>Sidebar</b><small>Spaces and tabs together</small></span>
                    </button>
                    <button
                      type="button"
                      className={settings.layout === "classic" ? "settings-choice is-active" : "settings-choice"}
                      aria-pressed={settings.layout === "classic"}
                      onClick={() => onUpdateSettings({ layout: "classic" })}
                    >
                      <span className="settings-layout-preview is-classic"><i /><i /><i /></span>
                      <span><b>Classic</b><small>Tabs along the top</small></span>
                    </button>
                  </div>
                  {settings.layout === "sidebar" ? (
                    <div className="settings-inline-row">
                      <span><b>Address bar</b><small>Place search in the top bar or the sidebar.</small></span>
                      <div className="settings-segment settings-segment-compact">
                        <button
                          type="button"
                          className={settings.addressBarPlacement === "toolbar" ? "settings-seg-btn is-active" : "settings-seg-btn"}
                          aria-pressed={settings.addressBarPlacement === "toolbar"}
                          onClick={() => onUpdateSettings({ addressBarPlacement: "toolbar" })}
                        >Top</button>
                        <button
                          type="button"
                          className={settings.addressBarPlacement === "sidebar" ? "settings-seg-btn is-active" : "settings-seg-btn"}
                          aria-pressed={settings.addressBarPlacement === "sidebar"}
                          onClick={() => onUpdateSettings({ addressBarPlacement: "sidebar" })}
                        >Side</button>
                      </div>
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}

            {activeSection === "appearance" ? (
              <>
                <section className="settings-section-intro">
                  <h3>Set the atmosphere.</h3>
                  <p>Theme changes apply everywhere. Space color gives each workspace its own sense of place.</p>
                </section>
                <section className="settings-card">
                  <div className="settings-card-head">
                    <span className="settings-card-icon"><Icon name="sun" size={16} /></span>
                    <span><b>Theme</b><small>Choose the light around your web.</small></span>
                  </div>
                  <div className="settings-theme-grid" role="radiogroup" aria-label="Theme">
                    {THEME_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={theme === option.id}
                        className={theme === option.id ? "settings-theme is-active" : "settings-theme"}
                        onClick={() => onSetTheme(option.id)}
                      >
                        <span className={`settings-theme-preview is-${option.id}`}><i /><i /><i /></span>
                        <span><b>{option.label}</b><small>{option.hint}</small></span>
                        <span className="settings-theme-check"><Icon name="check" size={12} /></span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <span className="settings-card-icon"><Icon name="sparkle" size={16} /></span>
                    <span><b>Active Space color</b><small>Tints the sidebar, selection and start page.</small></span>
                  </div>
                  <div className="settings-accent-list" role="radiogroup" aria-label="Active Space color">
                    {ACCENT_OPTIONS.map((option) => (
                      <button
                        key={option.hex}
                        type="button"
                        role="radio"
                        aria-checked={option.hex.toLowerCase() === accent.toLowerCase()}
                        className={option.hex.toLowerCase() === accent.toLowerCase() ? "settings-accent is-active" : "settings-accent"}
                        style={{ "--swatch": option.hex } as React.CSSProperties}
                        aria-label={option.label}
                        title={option.label}
                        onClick={() => onPickAccent(option.hex)}
                      ><Icon name="check" size={13} /></button>
                    ))}
                  </div>
                  <div className="settings-inline-row">
                    <span><b>Background glow</b><small>Show the soft horizon on new tabs.</small></span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={backgroundGlowEnabled}
                      className={backgroundGlowEnabled ? "settings-switch is-on" : "settings-switch"}
                      onClick={onToggleBackgroundGlow}
                    ><span className="settings-switch-knob" /></button>
                  </div>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <span className="settings-card-icon"><Icon name="square" size={16} /></span>
                    <span><b>Toolbar</b><small>Keep only the actions that earn their space.</small></span>
                  </div>
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
                          <span className="settings-chip-check">{on ? <Icon name="check" size={12} /> : null}</span>
                          {TOOLBAR_BUTTON_LABELS[key]}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </>
            ) : null}

            {activeSection === "privacy" ? (
              <>
                <section className="settings-section-intro">
                  <h3>Protection without the fuss.</h3>
                  <p>Andromeda blocks unwanted requests and stores passwords in your Mac’s encrypted keychain.</p>
                </section>
                <section className="settings-card">
                  <div className="settings-row settings-row-plain">
                    <span className="settings-card-icon is-shield"><Icon name="shield" size={17} /></span>
                    <span className="settings-row-copy">
                      <span>Block ads &amp; trackers</span>
                      <small>{shield?.active ? `${shield.blockedTotal.toLocaleString()} requests blocked since launch` : "Filter lists are getting ready…"}</small>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={shield?.enabled ?? false}
                      aria-label="Block ads and trackers"
                      className={shield?.enabled ? "settings-switch is-on" : "settings-switch"}
                      disabled={!shield?.active}
                      onClick={handleToggleShield}
                    ><span className="settings-switch-knob" /></button>
                  </div>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <span className="settings-card-icon"><Icon name="key" size={16} /></span>
                    <span><b>Saved passwords</b><small>Revealing a password may ask for Touch ID.</small></span>
                  </div>
                  {!passwordsAvailable ? (
                    <p className="settings-empty-copy">The system keychain is not available right now.</p>
                  ) : passwords === null ? (
                    <p className="settings-empty-copy">Loading your saved logins…</p>
                  ) : passwords.length > 0 ? (
                    <div className="settings-pw-list">
                      {passwords.map((credential) => (
                        <div className="settings-pw-row" key={credential.id}>
                          <span className="settings-password-avatar">{hostFromOrigin(credential.origin).charAt(0).toUpperCase()}</span>
                          <span className="settings-row-copy">
                            <span>{hostFromOrigin(credential.origin)}</span>
                            <small>{credential.username || "No username"}{revealedId === credential.id ? <code className="settings-pw-secret">{revealedValue}</code> : null}</small>
                          </span>
                          <span className="settings-pw-actions">
                            <button type="button" className="settings-pw-btn" onClick={() => handleToggleReveal(credential.id)}>
                              {revealedId === credential.id ? "Hide" : "Show"}
                            </button>
                            <button
                              type="button"
                              className="settings-pw-btn is-danger"
                              aria-label={`Delete password for ${hostFromOrigin(credential.origin)}`}
                              onClick={() => handleDeletePassword(credential.id)}
                            ><Icon name="trash" size={14} /></button>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="settings-empty-copy">Logins you save will appear here, protected by your Mac.</p>
                  )}
                </section>

                <section className="settings-card">
                  <div className="settings-row settings-row-plain">
                    <span className="settings-card-icon is-danger"><Icon name="trash" size={16} /></span>
                    <span className="settings-row-copy"><span>Clear browsing data</span><small>Removes history, cache and site data. Saved logins stay.</small></span>
                    <button type="button" className={clearArmed ? "settings-clear is-armed" : "settings-clear"} onClick={handleClear}>
                      {didClear ? "Cleared" : clearArmed ? "Confirm clear" : "Clear…"}
                    </button>
                  </div>
                </section>
              </>
            ) : null}

            {activeSection === "data" ? (
              <>
                <section className="settings-section-intro">
                  <h3>Your web, portable.</h3>
                  <p>Bring your browsing life over, or keep a private backup you control.</p>
                </section>
                <section className="settings-card settings-import-card">
                  <div className="settings-row settings-row-plain">
                    <span className="settings-import-mark"><span /><span /><span /><span /></span>
                    <span className="settings-row-copy">
                      <span>Import from Chrome</span>
                      <small>
                        {importState.phase === "done"
                          ? `Imported ${importState.passwords} password${importState.passwords === 1 ? "" : "s"}, ${importState.pages} page${importState.pages === 1 ? "" : "s"} and ${importState.shortcuts} shortcut${importState.shortcuts === 1 ? "" : "s"}.`
                          : importState.phase === "error"
                            ? "Import failed. Close Chrome, then try once more."
                            : chromeAvailable === false
                              ? "Chrome data was not found on this Mac."
                              : "Bring over bookmarks, history and saved passwords."}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="settings-primary-small"
                      disabled={chromeAvailable !== true || importState.phase === "running"}
                      onClick={handleImport}
                    >{importState.phase === "running" ? "Importing…" : importState.phase === "done" ? "Imported" : "Import"}</button>
                  </div>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <span className="settings-card-icon"><Icon name="download" size={16} /></span>
                    <span><b>Backup &amp; restore</b><small>Spaces, tabs, bookmarks, history and preferences.</small></span>
                  </div>
                  <div className="settings-data-actions">
                    <div className="settings-data-action">
                      <span><b>Download a backup</b><small>{backupStatus.kind === "exported" ? "Backup downloaded." : "Save an Andromeda backup to your Mac."}</small></span>
                      <button type="button" className="settings-clear" onClick={handleBackup}>Back up</button>
                    </div>
                    <div className="settings-data-action">
                      <span><b>Restore from a backup</b><small>
                        {backupStatus.kind === "restored"
                          ? `Restored ${backupStatus.count} item${backupStatus.count === 1 ? "" : "s"} — reloading…`
                          : backupStatus.kind === "error"
                            ? "That file is not a valid Andromeda backup."
                            : "Replaces current browser data with the selected file."}
                      </small></span>
                      <button type="button" className="settings-clear" onClick={() => backupInputRef.current?.click()}>Restore…</button>
                    </div>
                  </div>
                  <input ref={backupInputRef} type="file" accept="application/json,.json" hidden onChange={handleRestoreFile} />
                </section>

                <section className="settings-about-card">
                  <AndromedaMark size={26} />
                  <span><b>Andromeda {version || "—"}</b><small>Quiet browsing. Clear mind.</small></span>
                </section>
              </>
            ) : null}
          </div>

          <footer className="settings-foot">
            <span><span className="settings-saved-dot" aria-hidden="true" /> Changes save instantly</span>
            <button className="settings-done" type="button" onClick={onClose}>Done</button>
          </footer>
        </div>
        {pendingRestore ? (
          <div className="settings-confirm-layer" role="presentation">
            <div className="settings-confirm" role="alertdialog" aria-modal="true" aria-labelledby="restore-confirm-title">
              <span className="settings-confirm-icon"><Icon name="reload" size={20} /></span>
              <h3 id="restore-confirm-title">Replace current browser data?</h3>
              <p>
                This backup contains {pendingRestore.items} saved {pendingRestore.items === 1 ? "item" : "items"}
                {pendingRestore.exportedAt ? ` from ${new Date(pendingRestore.exportedAt).toLocaleDateString()}` : ""}.
                Your current spaces, tabs and settings will be replaced.
              </p>
              <div className="settings-confirm-actions">
                <button type="button" className="settings-clear" onClick={() => setPendingRestore(null)}>Cancel</button>
                <button ref={confirmRestoreRef} type="button" className="settings-confirm-primary" onClick={handleConfirmRestore}>Restore backup</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default memo(SettingsPanel);
