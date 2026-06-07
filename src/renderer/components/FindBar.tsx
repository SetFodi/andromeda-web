import { memo, useEffect, useRef, useState } from "react";
import Icon from "./Icon";

type FindBarProps = {
  isOpen: boolean;
  onFind: (query: string, options: { forward: boolean; findNext: boolean }) => void;
  onClose: () => void;
};

function FindBar({ isOpen, onFind, onClose }: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ active: number; total: number } | null>(null);

  useEffect(() => {
    return window.andromeda.onFoundInPage(({ activeMatchOrdinal, matches }) => {
      setResult({ active: activeMatchOrdinal, total: matches });
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setResult(null);
      return;
    }

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    if (query.trim()) {
      onFind(query, { forward: true, findNext: false });
    }

    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const runSearch = (value: string) => {
    setQuery(value);
    onFind(value, { forward: true, findNext: false });
    if (!value.trim()) {
      setResult(null);
    }
  };

  const findNext = (forward: boolean) => {
    if (query.trim()) {
      onFind(query, { forward, findNext: true });
    }
  };

  const hasQuery = query.trim().length > 0;
  const noMatches = hasQuery && result !== null && result.total === 0;

  return (
    <div className="find-bar" role="search">
      <div className={noMatches ? "find-field has-no-match" : "find-field"}>
        <Icon name="search" size={15} />
        <input
          ref={inputRef}
          className="find-input"
          value={query}
          placeholder="Find in page"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(event) => runSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              findNext(!event.shiftKey);
            } else if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
        />
        <span className="find-count">
          {hasQuery ? `${result?.total ? result.active : 0}/${result?.total ?? 0}` : ""}
        </span>
      </div>
      <div className="find-nav">
        <button
          type="button"
          className="find-btn"
          aria-label="Previous match"
          disabled={!hasQuery}
          onClick={() => findNext(false)}
        >
          <Icon name="chevronRight" size={15} className="find-chevron-up" />
        </button>
        <button
          type="button"
          className="find-btn"
          aria-label="Next match"
          disabled={!hasQuery}
          onClick={() => findNext(true)}
        >
          <Icon name="chevronRight" size={15} className="find-chevron-down" />
        </button>
        <button type="button" className="find-btn find-close" aria-label="Close find" onClick={onClose}>
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  );
}

export default memo(FindBar);
