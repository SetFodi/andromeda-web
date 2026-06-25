import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import AndromedaMark from "./AndromedaMark";
import Icon from "./Icon";
import PreviewNote from "./PreviewNote";
import { SEARCH_ENGINES, SearchEngineId } from "../utils/url";
import type { ThemeMode } from "../state/useTheme";

const ACCENT_OPTIONS = [
  "#f28366",
  "#f4a23b",
  "#41a96c",
  "#3bb0c9",
  "#4f7df4",
  "#7c5cff",
  "#e0567f",
  "#8a8f98"
];

const THEME_OPTIONS: Array<{ id: ThemeMode; label: string; hint: string }> = [
  { id: "glow", label: "Glow", hint: "Ambient dark" },
  { id: "day", label: "Day", hint: "Warm light" },
  { id: "night", label: "Night", hint: "Pure dark" }
];

const ENGINE_HINTS: Record<SearchEngineId, string> = {
  google: "The familiar default",
  duckduckgo: "Doesn't track your searches",
  bing: "Microsoft's engine"
};

const LAST_STEP = 2;

type OnboardingModalProps = {
  isOpen: boolean;
  name: string;
  theme: ThemeMode;
  accent: string;
  searchEngine: SearchEngineId;
  onSetName: (name: string) => void;
  onPickTheme: (mode: ThemeMode) => void;
  onPickAccent: (hex: string) => void;
  onPickSearchEngine: (id: SearchEngineId) => void;
  onFinish: () => void;
};

function OnboardingModal({
  isOpen,
  name,
  theme,
  accent,
  searchEngine,
  onSetName,
  onPickTheme,
  onPickAccent,
  onPickSearchEngine,
  onFinish
}: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && step === 1) {
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [isOpen, step]);

  if (!isOpen) {
    return null;
  }

  const next = () => {
    if (step >= LAST_STEP) {
      onFinish();
      return;
    }
    setStep(step + 1);
  };

  return (
    <div className="onboard-layer" role="presentation">
      <section className="onboard-panel" role="dialog" aria-modal="true" aria-label="Welcome to Andromeda">
        <button type="button" className="onboard-skip" onClick={onFinish}>
          Skip
        </button>

        {step === 0 ? (
          <div className="onboard-step" key="welcome">
            <div className="onboard-hero">
              <span className="onboard-logo">
                <AndromedaMark size={58} />
              </span>
              <h1>Welcome to Andromeda</h1>
              <p>A calm, fast home for your web. Set it up in twenty seconds.</p>
            </div>
            <div className="onboard-features">
              <div className="onboard-feature">
                <span className="onboard-feature-icon">
                  <Icon name="grid" size={17} />
                </span>
                <span className="onboard-feature-copy">
                  <span>Spaces</span>
                  <small>Separate worlds for work, play and everything else</small>
                </span>
              </div>
              <div className="onboard-feature">
                <span className="onboard-feature-icon">
                  <Icon name="shield" size={17} />
                </span>
                <span className="onboard-feature-copy">
                  <span>Shield</span>
                  <small>Ads and trackers are blocked before they load</small>
                </span>
              </div>
              <div className="onboard-feature">
                <span className="onboard-feature-icon">
                  <Icon name="reader" size={17} />
                </span>
                <span className="onboard-feature-copy">
                  <span>Reader</span>
                  <small>Any article, distilled to a beautiful page</small>
                </span>
              </div>
            </div>
            <PreviewNote />
          </div>
        ) : null}

        {step === 1 ? (
          <div className="onboard-step" key="style">
            <header className="onboard-step-head">
              <h2>Make it yours</h2>
              <p>Everything here previews live — and you can change it anytime.</p>
            </header>

            <label className="onboard-label" htmlFor="onboard-name">
              What should we call you?
            </label>
            <input
              id="onboard-name"
              ref={nameRef}
              className="onboard-input"
              value={name}
              placeholder="Your name (optional)"
              spellCheck={false}
              maxLength={40}
              onChange={(event) => onSetName(event.target.value)}
            />

            <span className="onboard-label">Appearance</span>
            <div className="onboard-themes">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={theme === option.id ? "onboard-theme is-active" : "onboard-theme"}
                  onClick={() => onPickTheme(option.id)}
                >
                  <span className={`onboard-theme-swatch is-${option.id}`} aria-hidden="true" />
                  <span>{option.label}</span>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>

            <span className="onboard-label">Theme color</span>
            <div className="onboard-accents">
              {ACCENT_OPTIONS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={
                    hex.toLowerCase() === accent.toLowerCase()
                      ? "onboard-accent is-active"
                      : "onboard-accent"
                  }
                  style={{ "--swatch": hex } as CSSProperties}
                  aria-label={`Use ${hex} as the theme color`}
                  onClick={() => onPickAccent(hex)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="onboard-step" key="search">
            <header className="onboard-step-head">
              <h2>How do you search?</h2>
              <p>Typed words go straight to this engine. URLs just open.</p>
            </header>
            <div className="onboard-engines">
              {(Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={searchEngine === id ? "onboard-engine is-active" : "onboard-engine"}
                  onClick={() => onPickSearchEngine(id)}
                >
                  <span className="onboard-engine-copy">
                    <span>{SEARCH_ENGINES[id].label}</span>
                    <small>{ENGINE_HINTS[id]}</small>
                  </span>
                  <span className="onboard-engine-dot" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <footer className="onboard-foot">
          {step > 0 ? (
            <button type="button" className="onboard-back" onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : (
            <span />
          )}
          <span className="onboard-dots" aria-hidden="true">
            {[0, 1, 2].map((dot) => (
              <span key={dot} className={dot === step ? "onboard-dot is-active" : "onboard-dot"} />
            ))}
          </span>
          <button type="button" className="onboard-next" onClick={next}>
            {step === LAST_STEP ? "Start browsing" : "Continue"}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default memo(OnboardingModal);
