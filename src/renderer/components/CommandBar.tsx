import { useEffect, useMemo, useRef, useState } from "react";
import { resolveNavigationInput } from "../utils/url";
import { getFaviconSrc } from "../utils/favicon";
import Icon, { IconName } from "./Icon";

type HistoryItem = {
  id: string;
  title: string;
  url: string;
  faviconUrl?: string;
  visitCount?: number;
  typedCount?: number;
  lastVisited?: number;
};

function frecencyScore(item: HistoryItem): number {
  const base = (item.visitCount ?? 0) + (item.typedCount ?? 0) * 2;
  const ageDays = item.lastVisited ? (Date.now() - item.lastVisited) / 86_400_000 : 999;
  const recency = ageDays < 1 ? 3 : ageDays < 4 ? 2 : ageDays < 14 ? 1 : 0.4;
  return base * recency + 0.001;
}

type CommandBarProps = {
  isOpen: boolean;
  mode: "default" | "split";
  focusToken: number;
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
  matchRank?: number;
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

function getDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function getMatchRank(item: HistoryItem, normalizedQuery: string): number {
  if (!normalizedQuery) {
    return 0;
  }

  const title = normalize(item.title);
  const host = normalize(getHostname(item.url));
  const displayUrl = normalize(getDisplayUrl(item.url));

  if (host.startsWith(normalizedQuery)) {
    return 0;
  }
  if (displayUrl.startsWith(normalizedQuery)) {
    return 1;
  }
  if (title.startsWith(normalizedQuery)) {
    return 2;
  }
  if (host.includes(normalizedQuery) || displayUrl.includes(normalizedQuery)) {
    return 3;
  }
  if (title.includes(normalizedQuery)) {
    return 4;
  }

  return Number.POSITIVE_INFINITY;
}

function getCompletionText(query: string, historyItems: HistoryItem[]): string | null {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return null;
  }

  for (const item of historyItems) {
    const candidates = [getHostname(item.url), getDisplayUrl(item.url), item.title].filter(Boolean);
    const candidate = candidates.find((value) => {
      const normalizedValue = normalize(value);
      return normalizedValue.startsWith(normalizedQuery) && normalizedValue !== normalizedQuery;
    });

    if (candidate) {
      return candidate;
    }
  }

  return null;
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
  focusToken,
  historyItems = [],
  onClose,
  onNavigateInput,
  onOpenUrl
}: CommandBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const completionText = useMemo(() => getCompletionText(query, historyItems), [historyItems, query]);

  const results = useMemo<QuickOpenResult[]>(() => {
    const normalizedQuery = normalize(query);
    const navigationTarget: "active" | "split" = mode === "split" ? "split" : "active";
    const historyResults: QuickOpenResult[] = historyItems
      .map((item, index) => ({ item, index, rank: getMatchRank(item, normalizedQuery) }))
      .filter(({ rank }) => Number.isFinite(rank))
      .sort((a, b) => a.rank - b.rank || frecencyScore(b.item) - frecencyScore(a.item))
      .slice(0, 5)
      .map(({ item, rank }) => ({
        id: `history-${item.id}`,
        title: item.title || getHostname(item.url),
        subtitle: getDisplayUrl(item.url),
        faviconUrl: getFaviconSrc(item.url, item.faviconUrl),
        icon: "history",
        matchRank: rank,
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

    const bestHistoryResult = historyResults[0];
    if (bestHistoryResult && bestHistoryResult.matchRank !== undefined && bestHistoryResult.matchRank <= 2) {
      return [...historyResults, navigationResult];
    }

    return [navigationResult, ...historyResults];
  }, [historyItems, mode, onNavigateInput, onOpenUrl, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery("");
    setSelectedIndex(0);
    const focusInput = () => {
      const input = inputRef.current;
      if (!input) {
        return;
      }
      input.focus({ preventScroll: true });
      input.select();
    };
    focusInput();
    const frame = requestAnimationFrame(focusInput);
    const shortRetry = window.setTimeout(focusInput, 40);
    const lateRetry = window.setTimeout(focusInput, 120);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(shortRetry);
      window.clearTimeout(lateRetry);
    };
  }, [focusToken, isOpen]);

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
          <span className="command-input-field">
            {completionText ? (
              <span className="command-completion" aria-hidden="true">
                <span className="command-completion-typed">{query}</span>
                {completionText.slice(query.length)}
              </span>
            ) : null}
            <input
              autoFocus
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

                const isCaretAtEnd =
                  event.currentTarget.selectionStart === event.currentTarget.value.length &&
                  event.currentTarget.selectionEnd === event.currentTarget.value.length;
                if ((event.key === "Tab" || (event.key === "ArrowRight" && isCaretAtEnd)) && completionText) {
                  event.preventDefault();
                  setQuery(completionText);
                  setSelectedIndex(0);
                  return;
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  runSelectedResult();
                }
              }}
            />
          </span>
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
