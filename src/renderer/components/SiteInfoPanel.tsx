import { memo, useEffect, useState } from "react";
import Icon from "./Icon";

type SiteInfoPanelProps = {
  isOpen: boolean;
  url: string;
  onClose: () => void;
  onReload: () => void;
};

type ParsedSite = {
  host: string;
  secure: boolean;
};

function parseSite(url: string): ParsedSite | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return { host: parsed.hostname.replace(/^www\./, ""), secure: parsed.protocol === "https:" };
  } catch {
    return null;
  }
}

function SiteInfoPanel({ isOpen, url, onClose, onReload }: SiteInfoPanelProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
    }
  }, [isOpen]);

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

  const info = parseSite(url);

  const handleCopy = () => {
    if (!url) {
      return;
    }
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="siteinfo-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="siteinfo-panel"
        role="dialog"
        aria-label="Site information"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="siteinfo-head">
          <span className={info?.secure ? "siteinfo-badge is-secure" : "siteinfo-badge is-insecure"}>
            <Icon name="shield" size={17} />
          </span>
          <div className="siteinfo-headcopy">
            <span className="siteinfo-host">{info ? info.host : "Start page"}</span>
            <span className="siteinfo-status">
              {info
                ? info.secure
                  ? "Connection is secure"
                  : "Connection is not secure"
                : "Local Andromeda page"}
            </span>
          </div>
        </div>

        {info ? (
          <>
            <div className="siteinfo-url" title={url}>
              {url}
            </div>
            <div className="siteinfo-actions">
              <button type="button" className="siteinfo-action" onClick={handleCopy}>
                <Icon name="copy" size={15} />
                <span>{copied ? "Copied" : "Copy URL"}</span>
              </button>
              <button
                type="button"
                className="siteinfo-action"
                onClick={() => {
                  onReload();
                  onClose();
                }}
              >
                <Icon name="reload" size={15} />
                <span>Reload</span>
              </button>
            </div>
          </>
        ) : (
          <div className="siteinfo-empty">No website is loaded in this tab yet.</div>
        )}
      </section>
    </div>
  );
}

export default memo(SiteInfoPanel);
