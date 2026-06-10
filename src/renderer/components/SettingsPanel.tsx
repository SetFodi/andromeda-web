import { memo, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { SEARCH_ENGINES, SearchEngineId } from "../utils/url";
import type { Settings } from "../state/useSettings";

type SettingsPanelProps = {
  isOpen: boolean;
  settings: Settings;
  onUpdateSettings: (patch: Partial<Settings>) => void;
  onClearBrowsingData: () => void;
  onClose: () => void;
};

const SEARCH_OPTIONS = (Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map((id) => ({
  id,
  label: SEARCH_ENGINES[id].label
}));

function SettingsPanel({
  isOpen,
  settings,
  onUpdateSettings,
  onClearBrowsingData,
  onClose
}: SettingsPanelProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [shield, setShield] = useState<ShieldStats | null>(null);
  const [version, setVersion] = useState("");
  const [clearArmed, setClearArmed] = useState(false);
  const [didClear, setDidClear] = useState(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => nameRef.current?.focus());
    } else {
      setClearArmed(false);
      setDidClear(false);
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

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

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
