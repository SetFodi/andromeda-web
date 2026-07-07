import { useEffect, useMemo, useRef, useState } from "react";
import { getInlineCompletion, resolveNavigationInput } from "../utils/url";
import { getFaviconSrc } from "../utils/favicon";
import Icon, { IconName } from "./Icon";
import type { SwitcherTab } from "./TabSwitcher";

export type CommandAction = {
  id: string;
  title: string;
  subtitle?: string;
  icon: IconName;
  run: () => void;
};

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
  openTabs?: SwitcherTab[];
  actions?: CommandAction[];
  onSelectTab?: (tab: SwitcherTab) => void;
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
  group: string;
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
  openTabs = [],
  actions = [],
  onSelectTab,
  onClose,
  onNavigateInput,
  onOpenUrl
}: CommandBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const completion = useMemo(() => getInlineCompletion(query, historyItems.map((item) => item.url)), [historyItems, query]);

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
        icon: "history" as const,
        group: "History",
        matchRank: rank,
        run: () => onOpenUrl(item.url, navigationTarget)
      }));

    if (!normalizedQuery) {
      return historyResults.map((result) => ({ ...result, group: "Recent" }));
    }

    // Open tabs beat re-opening the same page from history — switching is
    // cheaper than a duplicate. Only offered in the default mode; the split
    // picker is about choosing a page to load.
    const tabResults: QuickOpenResult[] =
      mode === "split" || !onSelectTab
        ? []
        : openTabs
            .filter((tab) => !tab.isActive && !tab.isStartPage)
            .map((tab) => {
              const host = tab.url ? getHostname(tab.url) : "";
              const title = normalize(tab.title);
              const hostNormalized = normalize(host);
              const rank = hostNormalized.startsWith(normalizedQuery)
                ? 0
                : title.startsWith(normalizedQuery)
                  ? 1
                  : hostNormalized.includes(normalizedQuery)
                    ? 2
                    : title.includes(normalizedQuery)
                      ? 3
                      : Number.POSITIVE_INFINITY;
              return { tab, host, rank };
            })
            .filter(({ rank }) => Number.isFinite(rank))
            .sort((a, b) => a.rank - b.rank)
            .slice(0, 3)
            .map(({ tab, host }) => ({
              id: `tab-${tab.id}`,
              title: tab.title || host,
              subtitle: `${tab.spaceName}${tab.isSleeping ? " · asleep" : ""}`,
              faviconUrl: tab.url ? getFaviconSrc(tab.url, tab.faviconUrl) : null,
              icon: "globe" as const,
              group: "Switch to tab",
              run: () => onSelectTab(tab)
            }));

    const actionResults: QuickOpenResult[] = actions
      .filter((action) => normalize(action.title).includes(normalizedQuery))
      .slice(0, 3)
      .map((action) => ({
        id: `action-${action.id}`,
        title: action.title,
        subtitle: action.subtitle ?? "Command",
        icon: action.icon,
        group: "Actions",
        run: action.run
      }));

    const resolvedUrl = resolveNavigationInput(query);
    const navigationResult: QuickOpenResult = {
      id: "navigate-input",
      title: query.trim(),
      subtitle: looksLikeUrl(query) ? resolvedUrl : "Web search",
      icon: "search",
      group: "Go",
      run: () => onNavigateInput(query, navigationTarget)
    };

    const bestHistoryResult = historyResults[0];
    const core =
      bestHistoryResult && bestHistoryResult.matchRank !== undefined && bestHistoryResult.matchRank <= 2
        ? [...historyResults, navigationResult]
        : [navigationResult, ...historyResults];

    return [...core, ...tabResults, ...actionResults];
  }, [actions, historyItems, mode, onNavigateInput, onOpenUrl, onSelectTab, openTabs, query]);

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

  // Close first, then run: actions that open another surface (split view's
  // picker, panels) would otherwise be immediately closed again.
  const runResult = (result: QuickOpenResult | undefined) => {
    if (!result) {
      return;
    }

    onClose();
    result.run();
  };

  const runSelectedResult = () => {
    runResult(results[selectedIndex]);
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
            {completion ? (
              <span className="command-completion" aria-hidden="true">
                <span className="command-completion-typed">{query}</span>
                {completion.text.slice(query.length)}
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
                if ((event.key === "Tab" || (event.key === "ArrowRight" && isCaretAtEnd)) && completion) {
                  event.preventDefault();
                  setQuery(completion.text);
                  setSelectedIndex(0);
                  return;
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  if (completion && selectedIndex === 0) {
                    onClose();
                    onOpenUrl(completion.url, mode === "split" ? "split" : "active");
                  } else {
                    runSelectedResult();
                  }
                }
              }}
            />
          </span>
        </div>

        {results.length > 0 ? (
          <div className="command-results" role="listbox" aria-label="Search suggestions">
            {results.map((result, index) => {
              const previousGroup = index > 0 ? results[index - 1].group : null;
              const showGroupLabel = result.group !== previousGroup;
              return (
                <div key={result.id} className="command-result-row" role="presentation">
                  {showGroupLabel ? (
                    <div className="command-group-label" aria-hidden="true">
                      {result.group}
                    </div>
                  ) : null}
                  <button
                    className={index === selectedIndex ? "command-result is-selected" : "command-result"}
                    type="button"
                    role="option"
                    aria-selected={index === selectedIndex}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => runResult(result)}
                  >
                    <QuickOpenIcon result={result} />
                    <span className="command-result-copy">
                      <span>{result.title}</span>
                      <small>{result.subtitle}</small>
                    </span>
                    <kbd>↵</kbd>
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
        {results.length > 0 ? (
          <div className="command-foot" aria-hidden="true">
            <span><kbd>↑↓</kbd> navigate</span>
            <span><kbd>↵</kbd> open</span>
            <span><kbd>esc</kbd> close</span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
