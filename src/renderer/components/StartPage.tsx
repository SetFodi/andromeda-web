import { memo, useEffect, useState } from "react";
import Icon, { IconName } from "./Icon";
import { formatClock, formatLongDate, getGreeting } from "../utils/time";
import { getFaviconSrc } from "../utils/favicon";

export type RecentSite = {
  id: string;
  title: string;
  url: string;
};

type StartPageProps = {
  greetingName: string;
  onOpenCommand: () => void;
  onOpenLink: (url: string) => void;
  onImportChrome: () => void;
  recentSites: RecentSite[];
};

type QuickLink = {
  id: string;
  label: string;
  url: string;
  hue: string;
  icon?: IconName;
  monogram?: string;
};

const QUICK_LINKS: QuickLink[] = [
  { id: "github", label: "GitHub", url: "https://github.com", hue: "#2b3440", icon: "github" },
  { id: "linear", label: "Linear", url: "https://linear.app", hue: "#5b63d6", icon: "linear" },
  { id: "youtube", label: "YouTube", url: "https://youtube.com", hue: "#ef3f33", monogram: "Y" },
  { id: "figma", label: "Figma", url: "https://figma.com", hue: "#a259ff", monogram: "F" },
  { id: "notion", label: "Notion", url: "https://notion.so", hue: "#2f2c28", monogram: "N" },
  { id: "gmail", label: "Gmail", url: "https://mail.google.com", hue: "#ea4335", monogram: "M" },
  { id: "reddit", label: "Reddit", url: "https://reddit.com", hue: "#ff5a1f", monogram: "R" },
  { id: "x", label: "X", url: "https://x.com", hue: "#1d1d1f", monogram: "𝕏" }
];

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
  onOpenCommand,
  onOpenLink,
  onImportChrome,
  recentSites
}: StartPageProps) {
  const now = useNow();
  const greeting = getGreeting(now);

  return (
    <main className="start-page">
      <div className="start-ambient" aria-hidden="true">
        <span className="ambient-orb" />
        <span className="ambient-veil" />
        <AndromedaWaves />
      </div>

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
              <span>⌘</span>K
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
            <div className="quick-grid">
              {QUICK_LINKS.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  className="quick-tile"
                  title={getHostname(link.url)}
                  onClick={() => onOpenLink(link.url)}
                >
                  <span
                    className="quick-mark"
                    style={{ "--tile-hue": link.hue } as React.CSSProperties}
                  >
                    {link.icon ? <Icon name={link.icon} size={20} /> : link.monogram}
                  </span>
                  <span className="quick-label">{link.label}</span>
                  <Icon className="quick-go" name="arrowUpRight" size={15} />
                </button>
              ))}
            </div>
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

          <footer
            className="start-foot reveal"
            style={{ "--reveal-delay": "340ms" } as React.CSSProperties}
          >
            <p className="start-quote">The best browser is the one that gets out of your way.</p>
            <button type="button" className="start-import" onClick={onImportChrome}>
              Import from Chrome
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}

function AndromedaWaves() {
  return (
    <svg className="ambient-waves" viewBox="0 0 1200 360" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="waveCream" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--wave-cream-a)" />
          <stop offset="100%" stopColor="var(--wave-cream-b)" />
        </linearGradient>
        <linearGradient id="waveCoral" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--wave-coral-a)" />
          <stop offset="100%" stopColor="var(--wave-coral-b)" />
        </linearGradient>
      </defs>
      <path
        className="ambient-wave"
        d="M0 250 C220 180 420 300 640 250 C860 200 1020 150 1200 196 L1200 360 L0 360 Z"
        fill="url(#waveCream)"
      />
      <path
        className="ambient-wave"
        d="M0 300 C260 248 460 330 700 300 C920 272 1050 246 1200 270 L1200 360 L0 360 Z"
        fill="url(#waveCoral)"
      />
    </svg>
  );
}

export default memo(StartPage);
