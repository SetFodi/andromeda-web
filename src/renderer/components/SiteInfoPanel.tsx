import { memo, useEffect, useState } from "react";
import Icon from "./Icon";

type SiteInfoPanelProps = {
  isOpen: boolean;
  url: string;
  pane: BrowserPane;
  onClose: () => void;
  onReload: () => void;
};

type ParsedSite = {
  host: string;
  secure: boolean;
};

const PERMISSION_LABELS: Record<string, string> = {
  media: "Camera & microphone",
  geolocation: "Location",
  notifications: "Notifications",
  "clipboard-read": "Clipboard",
  "display-capture": "Screen recording",
  fullscreen: "Fullscreen",
  pointerLock: "Pointer lock",
  midi: "MIDI devices",
  midiSysex: "MIDI devices (SysEx)"
};

function permissionLabel(permission: string): string {
  return PERMISSION_LABELS[permission] ?? permission.replace(/-/g, " ");
}

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

function SiteInfoPanel({ isOpen, url, pane, onClose, onReload }: SiteInfoPanelProps) {
  const [copied, setCopied] = useState(false);
  const [shield, setShield] = useState<ShieldStats | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    void window.andromeda.getShieldStats(pane).then((stats) => {
      if (!cancelled) {
        setShield(stats);
      }
    });
    if (url) {
      void window.andromeda.getSitePermissions(url).then((result) => {
        if (!cancelled) {
          setPermissions(result.permissions);
        }
      });
    } else {
      setPermissions([]);
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen, pane, url]);

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

  const handleRevoke = (permission: string) => {
    void window.andromeda.revokeSitePermission(url, permission);
    setPermissions((current) => current.filter((entry) => entry !== permission));
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
            {shield?.active ? (
              <div className={shield.enabled ? "siteinfo-shield" : "siteinfo-shield is-off"}>
                <span className="siteinfo-shield-count">
                  {shield.enabled ? shield.blockedOnPage : "—"}
                </span>
                <span className="siteinfo-shield-copy">
                  {shield.enabled ? (
                    <>
                      <span>Ads &amp; trackers blocked on this page</span>
                      <small>{shield.blockedTotal.toLocaleString()} blocked since launch</small>
                    </>
                  ) : (
                    <>
                      <span>Shield is off</span>
                      <small>Turn it back on in Settings</small>
                    </>
                  )}
                </span>
              </div>
            ) : null}

            <div className="siteinfo-url" title={url}>
              {url}
            </div>

            {permissions.length > 0 ? (
              <div className="siteinfo-perms">
                <span className="siteinfo-perms-label">Allowed this session</span>
                {permissions.map((permission) => (
                  <div key={permission} className="siteinfo-perm-row">
                    <span>{permissionLabel(permission)}</span>
                    <button
                      type="button"
                      className="siteinfo-perm-revoke"
                      onClick={() => handleRevoke(permission)}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

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
