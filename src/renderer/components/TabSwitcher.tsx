import { useEffect, useMemo, useRef, useState } from "react";
import { getFaviconSrc } from "../utils/favicon";
import Icon, { IconName } from "./Icon";

export type SwitcherTab = {
  spaceId: string;
  spaceName: string;
  spaceIcon: IconName;
  id: string;
  title: string;
  url: string | null;
  faviconUrl?: string;
  isStartPage: boolean;
  isSleeping: boolean;
  isActive: boolean;
};

type TabSwitcherProps = {
  isOpen: boolean;
  tabs: SwitcherTab[];
  onClose: () => void;
  onSelect: (spaceId: string, tabId: string) => void;
};

function hostOf(url: string | null): string {
  if (!url) {
    return "New Tab";
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function TabFavicon({ tab }: { tab: SwitcherTab }) {
  const [failed, setFailed] = useState(false);
  const src = tab.isStartPage ? null : getFaviconSrc(tab.url, tab.faviconUrl);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span className="command-result-icon">
      {src && !failed ? (
        <img alt="" src={src} onError={() => setFailed(true)} />
      ) : (
        <Icon name={tab.isStartPage ? "sparkle" : "globe"} size={17} />
      )}
    </span>
  );
}

export default function TabSwitcher({ isOpen, tabs, onClose, onSelect }: TabSwitcherProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return tabs;
    }
    return tabs.filter((tab) => {
      const host = hostOf(tab.url).toLowerCase();
      return (
        tab.title.toLowerCase().includes(normalized) ||
        host.includes(normalized) ||
        (tab.url ?? "").toLowerCase().includes(normalized) ||
        tab.spaceName.toLowerCase().includes(normalized)
      );
    });
  }, [query, tabs]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setQuery("");
    // Start on the first result that isn't the currently-active tab so Enter
    // jumps somewhere useful by default.
    setSelectedIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(results.length - 1, 0)));
  }, [results.length]);

  if (!isOpen) {
    return null;
  }

  const run = (index: number) => {
    const tab = results[index];
    if (!tab) {
      return;
    }
    onSelect(tab.spaceId, tab.id);
    onClose();
  };

  return (
    <div className="command-bar-layer" role="presentation" onMouseDown={onClose}>
      <section
        className={results.length > 0 ? "command-bar has-results" : "command-bar"}
        role="dialog"
        aria-modal="true"
        aria-label="Switch tab"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-input-wrap">
          <Icon name="grid" size={19} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Switch to an open tab…"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                if (results.length > 0) {
                  setSelectedIndex((current) => (current + 1) % results.length);
                }
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                if (results.length > 0) {
                  setSelectedIndex((current) => (current - 1 + results.length) % results.length);
                }
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                run(selectedIndex);
              }
            }}
          />
        </div>

        {results.length > 0 ? (
          <div className="command-results" role="listbox" aria-label="Open tabs">
            {results.map((tab, index) => (
              <button
                key={`${tab.spaceId}-${tab.id}`}
                className={index === selectedIndex ? "command-result is-selected" : "command-result"}
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => run(index)}
              >
                <TabFavicon tab={tab} />
                <span className="command-result-copy">
                  <span>
                    {tab.title || hostOf(tab.url)}
                    {tab.isSleeping ? <span className="switcher-flag">asleep</span> : null}
                  </span>
                  <small>{hostOf(tab.url)}</small>
                </span>
                <span className="switcher-space">
                  <Icon name={tab.spaceIcon} size={12} />
                  {tab.spaceName}
                </span>
                {tab.isActive ? <span className="switcher-current" aria-label="Current tab" /> : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="command-results">
            <div className="switcher-empty">No matching tabs</div>
          </div>
        )}
      </section>
    </div>
  );
}
