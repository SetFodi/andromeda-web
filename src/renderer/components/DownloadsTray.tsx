import { memo, useEffect } from "react";
import Icon from "./Icon";

export type DownloadEntry = {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  receivedBytes: number;
  totalBytes: number;
  state: string;
};

type DownloadsTrayProps = {
  isOpen: boolean;
  downloads: DownloadEntry[];
  onClose: () => void;
  onOpen: (path: string) => void;
  onReveal: (path: string) => void;
  onClear: () => void;
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

function statusLabel(entry: DownloadEntry): string {
  switch (entry.state) {
    case "completed":
      return formatBytes(entry.totalBytes || entry.receivedBytes);
    case "cancelled":
      return "Canceled";
    case "interrupted":
      return "Failed";
    case "paused":
      return "Paused";
    default:
      return entry.totalBytes > 0
        ? `${formatBytes(entry.receivedBytes)} of ${formatBytes(entry.totalBytes)}`
        : formatBytes(entry.receivedBytes);
  }
}

function DownloadsTray({ isOpen, downloads, onClose, onOpen, onReveal, onClear }: DownloadsTrayProps) {
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
    <div className="downloads-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="downloads-panel"
        role="dialog"
        aria-label="Downloads"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="downloads-head">
          <h2>Downloads</h2>
          {downloads.length > 0 ? (
            <button className="downloads-clear" type="button" onClick={onClear}>
              Clear
            </button>
          ) : null}
        </header>

        {downloads.length === 0 ? (
          <div className="downloads-empty">
            <Icon name="download" size={20} />
            <span>No downloads yet</span>
          </div>
        ) : (
          <div className="downloads-list">
            {downloads.map((entry) => {
              const progressing = entry.state === "progressing" || entry.state === "paused";
              const pct =
                entry.totalBytes > 0
                  ? Math.min(100, Math.round((entry.receivedBytes / entry.totalBytes) * 100))
                  : 0;
              const isComplete = entry.state === "completed";

              return (
                <div key={entry.id} className="download-row">
                  <span className="download-icon">
                    <Icon name={isComplete ? "docs" : "download"} size={16} />
                  </span>
                  <div className="download-copy">
                    <span className="download-name" title={entry.filename}>
                      {entry.filename}
                    </span>
                    {progressing ? (
                      <span className="download-bar">
                        <span className="download-bar-fill" style={{ width: `${pct}%` }} />
                      </span>
                    ) : null}
                    <span className="download-status">{statusLabel(entry)}</span>
                  </div>
                  {isComplete ? (
                    <span className="download-actions">
                      <button
                        type="button"
                        className="download-action"
                        title="Open"
                        aria-label={`Open ${entry.filename}`}
                        onClick={() => onOpen(entry.savePath)}
                      >
                        <Icon name="arrowUpRight" size={15} />
                      </button>
                      <button
                        type="button"
                        className="download-action"
                        title="Show in folder"
                        aria-label={`Show ${entry.filename} in folder`}
                        onClick={() => onReveal(entry.savePath)}
                      >
                        <Icon name="folder" size={15} />
                      </button>
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default memo(DownloadsTray);
