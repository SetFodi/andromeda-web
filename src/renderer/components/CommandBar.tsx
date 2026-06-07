import { useEffect, useMemo, useRef, useState } from "react";
import { resolveNavigationInput } from "../utils/url";
import Icon, { IconName } from "./Icon";

export type CommandBarItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  keywords?: string[];
  run: (query: string) => void | { keepOpen?: boolean };
};

type HistoryItem = {
  id: string;
  title: string;
  url: string;
};

type CommandBarProps = {
  isOpen: boolean;
  mode: "default" | "split";
  commands: CommandBarItem[];
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

type CommandResult = CommandBarItem & {
  kind: "command" | "navigation";
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

export default function CommandBar({
  isOpen,
  mode,
  commands,
  historyItems = [],
  onClose,
  onNavigateInput,
  onOpenUrl
}: CommandBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const results = useMemo<CommandResult[]>(() => {
    const normalizedQuery = normalize(query);
    const matchedCommands = normalizedQuery
      ? commands.filter((command) => {
          const haystack = normalize(
            [command.title, command.subtitle, ...(command.keywords ?? [])].join(" ")
          );
          return haystack.includes(normalizedQuery);
        })
      : commands;

    if (!normalizedQuery) {
      return matchedCommands.map((command) => ({ ...command, kind: "command" }));
    }

    const navigationTarget: "active" | "split" = mode === "split" ? "split" : "active";
    const historyResults: CommandResult[] = historyItems
      .filter((item) => {
        const haystack = normalize(`${item.title} ${item.url}`);
        return haystack.includes(normalizedQuery);
      })
      .slice(0, 4)
      .map((item) => ({
        id: `history-${item.id}`,
        title: item.title || getHostname(item.url),
        subtitle: getHostname(item.url),
        icon: "history",
        kind: "navigation",
        run: () => onOpenUrl(item.url, navigationTarget)
      }));

    const resolvedUrl = resolveNavigationInput(query);
    const navigationResult: CommandResult = {
      id: "navigate-input",
      title: looksLikeUrl(query) ? `Open ${query.trim()}` : `Search for "${query.trim()}"`,
      subtitle: looksLikeUrl(query) ? resolvedUrl : "Web search",
      icon: "search",
      kind: "navigation",
      run: () => onNavigateInput(query, "active")
    };
    const splitNavigationResult: CommandResult = {
      id: "navigate-split-input",
      title: looksLikeUrl(query)
        ? `Open ${query.trim()} in Split View`
        : `Search Split View for "${query.trim()}"`,
      subtitle: looksLikeUrl(query) ? resolvedUrl : "Right pane",
      icon: "square",
      kind: "navigation",
      run: () => onNavigateInput(query, "split")
    };

    if (mode === "split") {
      return [
        splitNavigationResult,
        ...historyResults,
        ...matchedCommands.map((command) => ({ ...command, kind: "command" as const }))
      ];
    }

    return [
      ...historyResults,
      ...matchedCommands.map((command) => ({ ...command, kind: "command" as const })),
      navigationResult,
      splitNavigationResult
    ];
  }, [commands, historyItems, mode, onNavigateInput, onOpenUrl, query]);

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

    const outcome = result.run(query);
    if (!outcome?.keepOpen) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="command-bar-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="command-bar"
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
            placeholder={
              mode === "split"
                ? "Search or open in the right split pane…"
                : "Search, open, or run a command…"
            }
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

        <div className="command-results" role="listbox" aria-label="Command results">
          {results.map((result, index) => (
            <button
              key={`${result.kind}-${result.id}`}
              className={index === selectedIndex ? "command-result is-selected" : "command-result"}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => {
                const outcome = result.run(query);
                if (!outcome?.keepOpen) {
                  onClose();
                }
              }}
            >
              <span className="command-result-icon">
                <Icon name={result.icon} size={18} />
              </span>
              <span className="command-result-copy">
                <span>{result.title}</span>
                <small>{result.subtitle}</small>
              </span>
              <kbd>↵</kbd>
            </button>
          ))}
        </div>

        <footer className="command-foot">
          <span className="command-foot-hint">
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            navigate
          </span>
          <span className="command-foot-hint">
            <kbd>↵</kbd>
            open
          </span>
          <span className="command-foot-hint">
            <kbd>esc</kbd>
            dismiss
          </span>
        </footer>
      </section>
    </div>
  );
}
