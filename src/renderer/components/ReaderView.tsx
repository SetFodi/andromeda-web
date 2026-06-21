import { memo, useEffect, useMemo } from "react";
import DOMPurify from "dompurify";
import Icon from "./Icon";

export type ReaderArticle = {
  title: string;
  byline: string;
  html: string;
  url: string;
};

type ReaderViewProps = {
  isOpen: boolean;
  loading: boolean;
  article: ReaderArticle | null;
  onClose: () => void;
  onOpenLink: (url: string) => void;
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "A") {
    return;
  }
  const href = node.getAttribute("href");
  if (href && /^https?:\/\//i.test(href)) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noreferrer noopener");
  } else {
    node.removeAttribute("href");
  }
});

// Reader HTML comes from arbitrary web pages, and Mozilla Readability (the
// primary extractor) is explicitly NOT a sanitizer, so it is scrubbed here at
// the dangerouslySetInnerHTML sink before it reaches the privileged shell DOM.
function sanitizeArticleHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

function ReaderView({ isOpen, loading, article, onClose, onOpenLink }: ReaderViewProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const safeHtml = useMemo(() => (article ? sanitizeArticleHtml(article.html) : ""), [article]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="reader-layer">
      <button className="reader-close" type="button" aria-label="Close reader" onClick={onClose}>
        <Icon name="close" size={17} />
      </button>
      <div className="reader-scroll">
        {loading ? (
          <div className="reader-status">
            <span className="reader-spinner" />
            <span>Distilling article…</span>
          </div>
        ) : article ? (
          <article className="reader-doc">
            <header className="reader-doc-head">
              <span className="reader-source">{hostOf(article.url)}</span>
              <h1>{article.title}</h1>
              {article.byline ? <p className="reader-byline">{article.byline}</p> : null}
            </header>
            <div
              className="reader-body"
              // Sanitized at this sink via sanitizeArticleHtml (DOMPurify); the
              // extractor returns untrusted web-page HTML.
              dangerouslySetInnerHTML={{ __html: safeHtml }}
              onClick={(event) => {
                const anchor = (event.target as HTMLElement).closest("a");
                if (!anchor) {
                  return;
                }
                event.preventDefault();
                const href = anchor.getAttribute("href");
                if (href && /^https?:\/\//.test(href)) {
                  onOpenLink(href);
                }
              }}
            />
          </article>
        ) : (
          <div className="reader-status">
            <Icon name="reader" size={26} />
            <span>This page doesn’t have a readable article.</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(ReaderView);
