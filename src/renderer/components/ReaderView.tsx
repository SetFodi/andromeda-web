import { memo, useEffect } from "react";
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
              // Content is sanitized to an allow-list of tags in the extractor.
              dangerouslySetInnerHTML={{ __html: article.html }}
              onClick={(event) => {
                const anchor = (event.target as HTMLElement).closest("a");
                const href = anchor?.getAttribute("href");
                if (href && /^https?:\/\//.test(href)) {
                  event.preventDefault();
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
