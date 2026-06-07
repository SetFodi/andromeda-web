function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Returns the best available favicon source for a page URL:
 * the real favicon reported by the page if we have it, otherwise an
 * instantly-resolvable icon derived from the hostname (so sidebar/recent
 * icons appear immediately instead of waiting for the page to load).
 */
export function getFaviconSrc(pageUrl: string | null | undefined, pageFaviconUrl?: string | null): string | null {
  if (isSafeHttpUrl(pageFaviconUrl)) {
    return pageFaviconUrl;
  }

  if (!pageUrl) {
    return null;
  }

  try {
    const host = new URL(pageUrl).hostname;
    if (!host) {
      return null;
    }
    return `https://icons.duckduckgo.com/ip3/${host}.ico`;
  } catch {
    return null;
  }
}
