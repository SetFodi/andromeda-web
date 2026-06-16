import { memo, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { getFaviconSrc } from "../utils/favicon";
import type { HistoryEntry } from "../state/useHistory";

type HistoryPanelProps = {
  isOpen: boolean;
  entries: HistoryEntry[];
  onOpenUrl: (url: string) => void;
  onDelete: (url: string) => void;
  onClear: () => void;
  onClose: () => void;
};

type DayGroup = {
  key: string;
  label: string;
  items: HistoryEntry[];
};

// Cap the chronological (no-search) view so opening the panel never renders the
// full history at once — search still spans every stored entry.
const MAX_VISIBLE_ENTRIES = 300;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function dayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (dayDiff <= 0) {
    return "Today";
  }
  if (dayDiff === 1) {
    return "Yesterday";
  }
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric"
  });
}

function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function HistoryFavicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const src = getFaviconSrc(url);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span className="history-favicon">
      {src && !failed ? (
        <img alt="" src={src} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Icon name="globe" size={15} />
      )}
    </span>
  );
}

function HistoryPanel({ isOpen, entries, onOpenUrl, onDelete, onClear, onClose }: HistoryPanelProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setConfirmClear(false);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) {
        window.clearTimeout(confirmTimerRef.current);
      }
    };
  }, []);

  const groups = useMemo<DayGroup[]>(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? entries.filter(
          (entry) =>
            entry.title.toLowerCase().includes(normalized) || entry.url.toLowerCase().includes(normalized)
        )
      : entries.slice(0, MAX_VISIBLE_ENTRIES);

    const result: DayGroup[] = [];
    let current: DayGroup | null = null;
    for (const entry of filtered) {
      const date = new Date(entry.lastVisited);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (!current || current.key !== key) {
        current = { key, label: dayLabel(entry.lastVisited), items: [] };
        result.push(current);
      }
      current.items.push(entry);
    }
    return result;
  }, [entries, query]);

  if (!isOpen) {
    return null;
  }

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      if (confirmTimerRef.current !== null) {
        window.clearTimeout(confirmTimerRef.current);
      }
      confirmTimerRef.current = window.setTimeout(() => setConfirmClear(false), 3200);
      return;
    }
    if (confirmTimerRef.current !== null) {
      window.clearTimeout(confirmTimerRef.current);
    }
    setConfirmClear(false);
    onClear();
  };

  return (
    <div className="history-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="history-panel"
        role="dialog"
        aria-modal="true"
        aria-label="History"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <header className="history-head">
          <h2>History</h2>
          <button className="settings-close" type="button" aria-label="Close history" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="history-search">
          <Icon name="search" size={17} />
          <input
            ref={searchRef}
            value={query}
            placeholder="Search history"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="history-body">
          {groups.length === 0 ? (
            <div className="history-empty">
              <Icon name="history" size={22} />
              <span>{query.trim() ? "No matching history" : "No browsing history yet"}</span>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key} className="history-group">
                <div className="history-daylabel">{group.label}</div>
                {group.items.map((entry) => (
                  <div key={`${group.key}-${entry.url}`} className="history-row">
                    <button
                      type="button"
                      className="history-open"
                      title={entry.url}
                      onClick={() => {
                        onOpenUrl(entry.url);
                        onClose();
                      }}
                    >
                      <HistoryFavicon url={entry.url} />
                      <span className="history-copy">
                        <span className="history-title">{entry.title || hostOf(entry.url)}</span>
                        <small>{hostOf(entry.url)}</small>
                      </span>
                    </button>
                    <span className="history-time">{timeLabel(entry.lastVisited)}</span>
                    <button
                      type="button"
                      className="history-del"
                      aria-label={`Remove ${entry.title || hostOf(entry.url)} from history`}
                      title="Remove"
                      onClick={() => onDelete(entry.url)}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <footer className="history-foot">
          <span>{entries.length === 1 ? "1 entry" : `${entries.length} entries`}</span>
          <button
            className={confirmClear ? "history-clear is-confirming" : "history-clear"}
            type="button"
            disabled={entries.length === 0}
            onClick={handleClear}
          >
            {confirmClear ? "Confirm — clear everything" : "Clear browsing data"}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default memo(HistoryPanel);
