import { memo, useEffect, useRef, type CSSProperties } from "react";
import Icon, { IconName } from "./Icon";
import { SEARCH_ENGINES, SearchEngineId } from "../utils/url";
import { APPEARANCE_ACCENTS, type Settings } from "../state/useSettings";
import type { ThemeMode } from "../state/useTheme";

type SettingsPanelProps = {
  isOpen: boolean;
  settings: Settings;
  theme: ThemeMode;
  appearanceAccent: string;
  onUpdateSettings: (patch: Partial<Settings>) => void;
  onSetTheme: (mode: ThemeMode) => void;
  onChangeAccent: (accent: string) => void;
  onClose: () => void;
};

const THEME_OPTIONS: Array<{ id: ThemeMode; label: string; icon: IconName }> = [
  { id: "glow", label: "Glow", icon: "sparkle" },
  { id: "day", label: "Day", icon: "sun" },
  { id: "night", label: "Night", icon: "moon" }
];

const SEARCH_OPTIONS = (Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map((id) => ({
  id,
  label: SEARCH_ENGINES[id].label
}));

function SettingsPanel({
  isOpen,
  settings,
  theme,
  appearanceAccent,
  onUpdateSettings,
  onSetTheme,
  onChangeAccent,
  onClose
}: SettingsPanelProps) {
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

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
            <p className="settings-hint">Shown in the start page greeting.</p>
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
            <label>Appearance</label>
            <div className="appearance-picker">
              <div className="appearance-modes" aria-label="Ambience">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={theme === option.id ? "appearance-mode is-active" : "appearance-mode"}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() => onSetTheme(option.id)}
                  >
                    <Icon name={option.icon} size={18} />
                  </button>
                ))}
              </div>
              <div className="appearance-swatches" aria-label="Accent color">
                {APPEARANCE_ACCENTS.map((accent) => (
                  <button
                    key={accent}
                    type="button"
                    className={
                      appearanceAccent.toLowerCase() === accent.toLowerCase()
                        ? "appearance-swatch is-active"
                        : "appearance-swatch"
                    }
                    style={{ "--swatch": accent } as CSSProperties}
                    aria-label={`Use ${accent}`}
                    onClick={() => onChangeAccent(accent)}
                  />
                ))}
              </div>
              <div className="appearance-preview" aria-hidden="true">
                <span className="appearance-preview-wave" />
                <span className="appearance-preview-dot" />
              </div>
            </div>
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
        </div>

        <footer className="settings-foot">
          <span>Andromeda · 0.1.0</span>
          <button className="settings-done" type="button" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

export default memo(SettingsPanel);
