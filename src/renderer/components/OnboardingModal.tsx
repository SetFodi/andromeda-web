import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import AndromedaMark from "./AndromedaMark";
import Icon from "./Icon";
import { SEARCH_ENGINES, type SearchEngineId } from "../utils/url";
import type { ThemeMode } from "../state/useTheme";

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

const THEME_OPTIONS: Array<{ id: ThemeMode; label: string; hint: string }> = [
  { id: "glow", label: "Glow", hint: "Ambient dark" },
  { id: "day", label: "Day", hint: "Warm light" },
  { id: "night", label: "Night", hint: "Quiet dark" }
];

const ENGINE_HINTS: Record<SearchEngineId, string> = {
  google: "Familiar and comprehensive",
  duckduckgo: "Search with less tracking",
  bing: "Microsoft’s search engine"
};

const STEP_LABELS = ["Welcome", "Your style", "Search", "Ready"];
const LAST_STEP = STEP_LABELS.length - 1;

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
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setStep(0);
    const frame = requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (step === 1) {
        nameRef.current?.focus({ preventScroll: true });
      } else {
        headingRef.current?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, step]);

  if (!isOpen) {
    return null;
  }

  const next = () => {
    if (step >= LAST_STEP) {
      onFinish();
      return;
    }
    setStep((current) => current + 1);
  };

  return (
    <div className="onboard-layer" role="presentation">
      <section
        ref={panelRef}
        className="onboard-panel onboard-experience"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboard-title"
        aria-describedby="onboard-progress"
        onKeyDown={(event) => {
          if (event.key !== "Tab") {
            return;
          }
          const focusable = Array.from(
            panelRef.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
        <div className="onboard-topline">
          <span className="onboard-wordmark"><AndromedaMark size={24} /> Andromeda</span>
          <span id="onboard-progress" className="onboard-progress-copy" aria-live="polite">
            {step + 1} of {STEP_LABELS.length} · {STEP_LABELS[step]}
          </span>
          <button type="button" className="onboard-skip" onClick={onFinish}>Skip setup</button>
        </div>

        <div className="onboard-content">
          {step === 0 ? (
            <div className="onboard-step onboard-welcome" key="welcome">
              <div className="onboard-welcome-copy">
                <span className="onboard-eyebrow">A calmer home for the web</span>
                <h1 id="onboard-title" ref={headingRef} tabIndex={-1}>
                  Browse in your own <em>orbit.</em>
                </h1>
                <p>
                  Andromeda keeps your tabs, tools and different parts of life beautifully organized—without getting between you and the page.
                </p>
                <div className="onboard-feature-grid">
                  <div className="onboard-feature">
                    <span className="onboard-feature-icon"><Icon name="grid" size={16} /></span>
                    <span className="onboard-feature-copy"><span>Spaces</span><small>Separate work, life and side quests.</small></span>
                  </div>
                  <div className="onboard-feature">
                    <span className="onboard-feature-icon"><Icon name="shield" size={16} /></span>
                    <span className="onboard-feature-copy"><span>Quiet by default</span><small>Ads and trackers are blocked for you.</small></span>
                  </div>
                  <div className="onboard-feature">
                    <span className="onboard-feature-icon"><Icon name="command" size={16} /></span>
                    <span className="onboard-feature-copy"><span>Quick Open</span><small>Search, switch tabs and run commands.</small></span>
                  </div>
                </div>
              </div>

              <div className="onboard-orbit-stage" aria-hidden="true">
                <span className="onboard-orbit-ring is-one" />
                <span className="onboard-orbit-ring is-two" />
                <span className="onboard-orbit-dot" />
                <span className="onboard-planet"><AndromedaMark size={72} /></span>
                <div className="onboard-mini-browser">
                  <span className="onboard-mini-lights"><i /><i /><i /></span>
                  <span className="onboard-mini-address" />
                  <span className="onboard-mini-sidebar">
                    <i className="is-active" /><i /><i /><i />
                  </span>
                  <span className="onboard-mini-page">
                    <i className="mini-greeting" /><i className="mini-title" /><i className="mini-search" />
                    <span><i /><i /><i /></span>
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="onboard-step onboard-configure" key="style">
              <header className="onboard-step-head">
                <span className="onboard-eyebrow">Make it feel like yours</span>
                <h2 id="onboard-title" ref={headingRef} tabIndex={-1}>Choose your atmosphere.</h2>
                <p>Everything previews live and remains available later in Settings.</p>
              </header>

              <div className="onboard-form-grid">
                <div className="onboard-form-main">
                  <label className="onboard-label" htmlFor="onboard-name">What should we call you?</label>
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
                  <div className="onboard-themes" role="radiogroup" aria-label="Appearance">
                    {THEME_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={theme === option.id}
                        className={theme === option.id ? "onboard-theme is-active" : "onboard-theme"}
                        onClick={() => onPickTheme(option.id)}
                      >
                        <span className={`onboard-theme-swatch is-${option.id}`} aria-hidden="true"><i /><i /></span>
                        <span>{option.label}</span><small>{option.hint}</small>
                        <span className="onboard-choice-check"><Icon name="check" size={11} /></span>
                      </button>
                    ))}
                  </div>

                  <span className="onboard-label">First Space color</span>
                  <div className="onboard-accents" role="radiogroup" aria-label="First Space color">
                    {ACCENT_OPTIONS.map((option) => (
                      <button
                        key={option.hex}
                        type="button"
                        role="radio"
                        aria-checked={option.hex.toLowerCase() === accent.toLowerCase()}
                        className={option.hex.toLowerCase() === accent.toLowerCase() ? "onboard-accent is-active" : "onboard-accent"}
                        style={{ "--swatch": option.hex } as CSSProperties}
                        aria-label={option.label}
                        title={option.label}
                        onClick={() => onPickAccent(option.hex)}
                      ><Icon name="check" size={12} /></button>
                    ))}
                  </div>
                </div>

                <div className={`onboard-live-preview is-${theme}`} style={{ "--preview-accent": accent } as CSSProperties} aria-hidden="true">
                  <span className="onboard-preview-label">Live preview</span>
                  <div className="onboard-preview-window">
                    <span className="onboard-preview-rail"><i /><i className="is-active" /><i /></span>
                    <span className="onboard-preview-body">
                      <i className="preview-wave" /><i className="preview-sun" />
                      <span>Good to see you{name.trim() ? `, ${name.trim()}` : ""}.</span>
                      <i className="preview-field" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="onboard-step onboard-search-step" key="search">
              <header className="onboard-step-head is-centered">
                <span className="onboard-eyebrow">One choice, easy to change</span>
                <h2 id="onboard-title" ref={headingRef} tabIndex={-1}>How should Andromeda search?</h2>
                <p>URLs open directly. Everything else goes to the engine you choose.</p>
              </header>
              <div className="onboard-engines" role="radiogroup" aria-label="Search engine">
                {(Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={searchEngine === id}
                    className={searchEngine === id ? "onboard-engine is-active" : "onboard-engine"}
                    onClick={() => onPickSearchEngine(id)}
                  >
                    <span className={`onboard-engine-mark is-${id}`}>{SEARCH_ENGINES[id].label.charAt(0)}</span>
                    <span className="onboard-engine-copy"><span>{SEARCH_ENGINES[id].label}</span><small>{ENGINE_HINTS[id]}</small></span>
                    <span className="onboard-engine-dot" aria-hidden="true"><Icon name="check" size={11} /></span>
                  </button>
                ))}
              </div>
              <div className="onboard-search-tip">
                <Icon name="command" size={16} />
                <span><b>Quick Open goes further.</b><small>Press ⌘T anywhere to search the web, switch to a tab or find a browser action.</small></span>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="onboard-step onboard-ready" key="ready">
              <span className="onboard-ready-mark"><AndromedaMark size={58} /></span>
              <span className="onboard-eyebrow">You’re all set</span>
              <h2 id="onboard-title" ref={headingRef} tabIndex={-1}>
                Welcome{name.trim() ? `, ${name.trim()}` : ""}.
              </h2>
              <p>Your first Space is ready. Three small shortcuts are enough to feel at home.</p>
              <div className="onboard-shortcut-grid">
                <div><kbd>⌘T</kbd><span><b>Quick Open</b><small>Search or open anything</small></span></div>
                <div><kbd>⌘⇧A</kbd><span><b>Tab switcher</b><small>See every open tab</small></span></div>
                <div><kbd>⌘S</kbd><span><b>Sidebar</b><small>Hide it, then peek back</small></span></div>
              </div>
              <div className="onboard-ready-note"><Icon name="shield" size={15} /> Shield is already on. No extra setup needed.</div>
            </div>
          ) : null}
        </div>

        <footer className="onboard-foot">
          <button type="button" className="onboard-back" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
            <Icon name="arrowLeft" size={14} /> Back
          </button>
          <span className="onboard-dots" aria-label="Setup progress">
            {STEP_LABELS.map((label, index) => (
              <button
                key={label}
                type="button"
                className={index === step ? "onboard-dot is-active" : index < step ? "onboard-dot is-complete" : "onboard-dot"}
                aria-label={`Go to ${label}, step ${index + 1}`}
                aria-current={index === step ? "step" : undefined}
                onClick={() => setStep(index)}
              />
            ))}
          </span>
          <button type="button" className="onboard-next" onClick={next}>
            {step === LAST_STEP ? "Start browsing" : "Continue"}
            <Icon name={step === LAST_STEP ? "sparkle" : "arrowRight"} size={14} />
          </button>
        </footer>
      </section>
    </div>
  );
}

export default memo(OnboardingModal);
