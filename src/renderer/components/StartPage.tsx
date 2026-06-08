import { memo, useEffect, useState } from "react";
import Icon, { IconName } from "./Icon";
import { formatClock, formatLongDate, getGreeting } from "../utils/time";
import { getFaviconSrc } from "../utils/favicon";
import type { QuickLink } from "../state/useQuickLinks";

export type RecentSite = {
  id: string;
  title: string;
  url: string;
};

type StartPageProps = {
  greetingName: string;
  quickLinks: QuickLink[];
  onOpenCommand: () => void;
  onOpenLink: (url: string) => void;
  onRemoveQuickLink: (id: string) => void;
  onReorderQuickLink: (sourceId: string, targetId: string) => void;
  recentSites: RecentSite[];
};

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getSiteFallbackIcon(url: string): IconName {
  const host = getHostname(url);
  if (host === "github.com" || host.endsWith(".github.com")) {
    return "github";
  }
  if (host === "linear.app" || host.endsWith(".linear.app")) {
    return "linear";
  }
  return "globe";
}

function RecentFavicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const src = getFaviconSrc(url);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span className="recent-icon">
      {src && !failed ? (
        <img alt="" src={src} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Icon name={getSiteFallbackIcon(url)} size={15} />
      )}
    </span>
  );
}

function QuickMark({ url, label }: { url: string; label: string }) {
  const [failed, setFailed] = useState(false);
  const src = getFaviconSrc(url);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span className="quick-mark">
      {src && !failed ? (
        <img alt="" src={src} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="quick-mark-letter">{label.charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  return now;
}

function StartPage({
  greetingName,
  quickLinks,
  onOpenCommand,
  onOpenLink,
  onRemoveQuickLink,
  onReorderQuickLink,
  recentSites
}: StartPageProps) {
  const now = useNow();
  const greeting = getGreeting(now);
  const [draggedQuickId, setDraggedQuickId] = useState<string | null>(null);
  const [dropQuickId, setDropQuickId] = useState<string | null>(null);

  return (
    <main className="start-page">
      <div className="start-scroll">
        <section className="start-stage">
          <header className="start-head reveal" style={{ "--reveal-delay": "40ms" } as React.CSSProperties}>
            <div className="start-clock">{formatClock(now)}</div>
            <h1 className="start-hello">
              {greeting}, <em>{greetingName}</em>
            </h1>
            <p className="start-date">{formatLongDate(now)}</p>
          </header>

          <button
            type="button"
            className="start-search reveal"
            style={{ "--reveal-delay": "120ms" } as React.CSSProperties}
            onClick={onOpenCommand}
          >
            <Icon name="search" size={19} />
            <span className="start-search-text">Search the web or type a URL</span>
            <kbd className="start-search-kbd">
              <span>⌘</span>T
            </kbd>
          </button>

          <section
            className="start-block reveal"
            style={{ "--reveal-delay": "200ms" } as React.CSSProperties}
          >
            <div className="start-block-head">
              <Icon name="grid" size={15} />
              <span>Quick links</span>
            </div>
            {quickLinks.length > 0 ? (
              <div className="quick-grid">
                {quickLinks.map((link) => (
                  <div
                    key={link.id}
                    className={[
                      "quick-tile",
                      draggedQuickId === link.id ? "is-dragging" : "",
                      dropQuickId === link.id ? "is-drop-target" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    title={getHostname(link.url)}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", link.id);
                      setDraggedQuickId(link.id);
                    }}
                    onDragEnd={() => {
                      setDraggedQuickId(null);
                      setDropQuickId(null);
                    }}
                    onDragOver={(event) => {
                      if (!draggedQuickId || draggedQuickId === link.id) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (dropQuickId !== link.id) {
                        setDropQuickId(link.id);
                      }
                    }}
                    onDrop={(event) => {
                      if (!draggedQuickId || draggedQuickId === link.id) {
                        return;
                      }
                      event.preventDefault();
                      onReorderQuickLink(draggedQuickId, link.id);
                      setDraggedQuickId(null);
                      setDropQuickId(null);
                    }}
                  >
                    <button
                      type="button"
                      className="quick-open"
                      onClick={() => onOpenLink(link.url)}
                    >
                      <QuickMark url={link.url} label={link.label} />
                      <span className="quick-label">{link.label}</span>
                    </button>
                    <button
                      type="button"
                      className="quick-remove"
                      aria-label={`Remove ${link.label}`}
                      title="Remove"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveQuickLink(link.id);
                      }}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <button type="button" className="quick-empty" onClick={onOpenCommand}>
                Save sites with the ☆ in the toolbar, or search with ⌘T
              </button>
            )}
          </section>

          {recentSites.length > 0 ? (
            <section
              className="start-block reveal"
              style={{ "--reveal-delay": "280ms" } as React.CSSProperties}
            >
              <div className="start-block-head">
                <Icon name="history" size={15} />
                <span>Recent</span>
              </div>
              <div className="recent-list">
                {recentSites.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    className="recent-row"
                    title={site.url}
                    onClick={() => onOpenLink(site.url)}
                  >
                    <RecentFavicon url={site.url} />
                    <span className="recent-copy">
                      <span className="recent-title">{site.title}</span>
                      <span className="recent-host">{getHostname(site.url)}</span>
                    </span>
                    <Icon className="recent-go" name="arrowUpRight" size={14} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export default memo(StartPage);
