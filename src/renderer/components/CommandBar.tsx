import { useEffect, useMemo, useRef, useState } from "react";
import { resolveNavigationInput } from "../utils/url";
import { getFaviconSrc } from "../utils/favicon";
import Icon, { IconName } from "./Icon";

type HistoryItem = {
  id: string;
  title: string;
  url: string;
};

type CommandBarProps = {
  isOpen: boolean;
  mode: "default" | "split";
  historyItems?: HistoryItem[];
  onClose: () => void;
  onNavigateInput: (input: string, target: "active" | "split") => void;
  onOpenUrl: (url: string, target: "active" | "split") => void;
};

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type QuickOpenResult = {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  faviconUrl?: string | null;
  run: () => void;
};

function looksLikeUrl(input: string): boolean {
  const value = input.trim();
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    (value.includes(".") && !/\s/.test(value))
  );
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function QuickOpenIcon({ result }: { result: QuickOpenResult }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [result.faviconUrl]);

  return (
    <span className="command-result-icon">
      {result.faviconUrl && !failed ? (
        <img alt="" src={result.faviconUrl} onError={() => setFailed(true)} />
      ) : (
        <Icon name={result.icon} size={18} />
      )}
    </span>
  );
}

export default function CommandBar({
  isOpen,
  mode,
  historyItems = [],
  onClose,
  onNavigateInput,
  onOpenUrl
}: CommandBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const results = useMemo<QuickOpenResult[]>(() => {
    const normalizedQuery = normalize(query);
    const navigationTarget: "active" | "split" = mode === "split" ? "split" : "active";
    const historyResults: QuickOpenResult[] = historyItems
      .filter((item) => {
        if (!normalizedQuery) {
          return true;
        }

        const haystack = normalize(`${item.title} ${item.url}`);
        return haystack.includes(normalizedQuery);
      })
      .slice(0, 5)
      .map((item) => ({
        id: `history-${item.id}`,
        title: item.title || getHostname(item.url),
        subtitle: getHostname(item.url),
        faviconUrl: getFaviconSrc(item.url),
        icon: "history",
        run: () => onOpenUrl(item.url, navigationTarget)
      }));

    if (!normalizedQuery) {
      return historyResults;
    }

    const resolvedUrl = resolveNavigationInput(query);
    const navigationResult: QuickOpenResult = {
      id: "navigate-input",
      title: query.trim(),
      subtitle: looksLikeUrl(query) ? resolvedUrl : "Web search",
      icon: "search",
      run: () => onNavigateInput(query, navigationTarget)
    };

    return [navigationResult, ...historyResults];
  }, [historyItems, mode, onNavigateInput, onOpenUrl, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery("");
    setSelectedIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(results.length - 1, 0)));
  }, [results.length]);

  const runSelectedResult = () => {
    const result = results[selectedIndex];
    if (!result) {
      return;
    }

    result.run();
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="command-bar-layer" role="presentation" onMouseDown={onClose}>
      <section
        className={results.length > 0 ? "command-bar has-results" : "command-bar"}
        role="dialog"
        aria-modal="true"
        aria-label="Andromeda command bar"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-input-wrap">
          <Icon name="search" size={19} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search..."
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
                if (results.length === 0) {
                  return;
                }
                setSelectedIndex((current) => (current + 1) % results.length);
                return;
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                if (results.length === 0) {
                  return;
                }
                setSelectedIndex((current) => (current - 1 + results.length) % results.length);
                return;
              }

              if (event.key === "Enter") {
                event.preventDefault();
                runSelectedResult();
              }
            }}
          />
        </div>

        {results.length > 0 ? (
          <div className="command-results" role="listbox" aria-label="Search suggestions">
            {results.map((result, index) => (
              <button
                key={result.id}
                className={index === selectedIndex ? "command-result is-selected" : "command-result"}
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => {
                  result.run();
                  onClose();
                }}
              >
                <QuickOpenIcon result={result} />
                <span className="command-result-copy">
                  <span>{result.title}</span>
                  <small>{result.subtitle}</small>
                </span>
                <kbd>↵</kbd>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
