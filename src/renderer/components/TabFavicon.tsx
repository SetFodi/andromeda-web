import { useEffect, useState } from "react";
import type { BrowserTab } from "../state/browserStore";
import Icon, { type IconName } from "./Icon";
import { getFaviconSrc } from "../utils/favicon";

function getTabHostname(tab: BrowserTab): string | null {
  if (!tab.url) {
    return null;
  }

  try {
    return new URL(tab.url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getTabFallbackIcon(tab: BrowserTab): IconName {
  if (tab.isStartPage) {
    return "docs";
  }

  const hostname = getTabHostname(tab);
  if (hostname === "github.com" || hostname?.endsWith(".github.com")) {
    return "github";
  }

  if (hostname === "linear.app" || hostname?.endsWith(".linear.app")) {
    return "linear";
  }

  return "globe";
}

// The favicon / state glyph shown on a tab — shared by the sidebar tab rows and
// the classic top tab strip so both render identical favicons, loading spinners,
// sleeping (moon) state, and per-host fallback icons.
export function TabFavicon({ tab, isLoading }: { tab: BrowserTab; isLoading: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = tab.isStartPage ? null : getFaviconSrc(tab.url, tab.faviconUrl);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span className={isLoading ? "tab-favicon is-loading" : "tab-favicon"}>
      {isLoading ? (
        <span className="tab-spinner" aria-label="Loading" />
      ) : tab.isSleeping ? (
        <Icon name="moon" size={15} />
      ) : src && !failed ? (
        <img alt="" src={src} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Icon name={getTabFallbackIcon(tab)} size={15} />
      )}
    </span>
  );
}
