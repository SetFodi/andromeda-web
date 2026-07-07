import { memo, type ReactNode } from "react";
import Icon from "./Icon";
import type { AddressBarPlacement, ToolbarButtons } from "../state/useSettings";

type ToolbarProps = {
  addressBar: ReactNode;
  addressBarPlacement: AddressBarPlacement;
  toolbarButtons: ToolbarButtons;
  isStartPage: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  isSidebarCollapsed: boolean;
  isClassicLayout: boolean;
  canBookmark: boolean;
  isBookmarked: boolean;
  hasActiveDownload: boolean;
  currentUrl: string;
  isSiteInfoOpen: boolean;
  isReaderOpen: boolean;
  savePasswordPrompt: SavePasswordPromptPayload | null;
  onRespondSavePassword: (action: "save" | "never" | "dismiss") => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onOpenSplitView: () => void;
  onToggleBookmark: () => void;
  onToggleDownloads: () => void;
  onToggleSiteInfo: () => void;
  onToggleReader: () => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  onCloseWindow: () => void;
  onMinimizeWindow: () => void;
  onToggleMaximizeWindow: () => void;
};

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Toolbar({
  addressBar,
  addressBarPlacement,
  toolbarButtons,
  isStartPage,
  canGoBack,
  canGoForward,
  isLoading,
  isSidebarCollapsed,
  isClassicLayout,
  canBookmark,
  isBookmarked,
  hasActiveDownload,
  currentUrl,
  isSiteInfoOpen,
  isReaderOpen,
  savePasswordPrompt,
  onRespondSavePassword,
  onBack,
  onForward,
  onReload,
  onOpenSplitView,
  onToggleBookmark,
  onToggleDownloads,
  onToggleSiteInfo,
  onToggleReader,
  onToggleSidebar,
  onOpenSettings,
  onCloseWindow,
  onMinimizeWindow,
  onToggleMaximizeWindow
}: ToolbarProps) {
  const addressInToolbar = addressBarPlacement === "toolbar";

  return (
    <header className={addressInToolbar ? "toolbar" : "toolbar is-address-elsewhere"}>
      {isLoading ? <span className="toolbar-progress" aria-hidden="true" /> : null}
      {isClassicLayout || isSidebarCollapsed ? (
        <div className="traffic-lights" aria-label="Window controls">
          <button className="traffic traffic-close" type="button" onClick={onCloseWindow} />
          <button className="traffic traffic-minimize" type="button" onClick={onMinimizeWindow} />
          <button className="traffic traffic-maximize" type="button" onClick={onToggleMaximizeWindow} />
        </div>
      ) : null}

      {!isClassicLayout ? (
        <button
          className={isSidebarCollapsed ? "toolbar-icon sidebar-switch is-active" : "toolbar-icon sidebar-switch"}
          type="button"
          aria-label="Toggle sidebar"
          aria-pressed={isSidebarCollapsed}
          onClick={onToggleSidebar}
        >
          <Icon name="panel" size={18} />
        </button>
      ) : null}

      <div className="navigation-controls" aria-label="Navigation controls">
        <button
          className="toolbar-icon"
          type="button"
          aria-label="Back"
          disabled={!canGoBack}
          onClick={onBack}
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <button
          className="toolbar-icon"
          type="button"
          aria-label="Forward"
          disabled={!canGoForward}
          onClick={onForward}
        >
          <Icon name="arrowRight" size={18} />
        </button>
        <button
          className={isLoading ? "toolbar-icon is-loading" : "toolbar-icon"}
          type="button"
          aria-label="Reload"
          disabled={isStartPage}
          onClick={onReload}
        >
          <Icon name="reload" size={16} />
        </button>
      </div>

      {addressInToolbar ? addressBar : <div className="toolbar-flex" aria-hidden="true" />}

      {savePasswordPrompt ? (
        <div className="pw-prompt" role="alertdialog" aria-label="Save password">
          <Icon name="key" size={15} />
          <span className="pw-prompt-text">
            {savePasswordPrompt.mode === "update" ? "Update password for " : "Save password for "}
            <b>{getHostname(savePasswordPrompt.origin)}</b>
            {savePasswordPrompt.username ? ` · ${savePasswordPrompt.username}` : ""}
          </span>
          <button
            className="pw-prompt-save"
            type="button"
            onClick={() => onRespondSavePassword("save")}
          >
            {savePasswordPrompt.mode === "update" ? "Update" : "Save"}
          </button>
          <button
            className="pw-prompt-never"
            type="button"
            onClick={() => onRespondSavePassword("never")}
          >
            Never
          </button>
          <button
            className="pw-prompt-dismiss"
            type="button"
            aria-label="Dismiss"
            onClick={() => onRespondSavePassword("dismiss")}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : null}

      <div className="toolbar-actions" aria-label="Browser actions">
        {toolbarButtons.bookmark ? (
          <button
            className={isBookmarked ? "toolbar-icon is-active" : "toolbar-icon"}
            type="button"
            aria-label={isBookmarked ? "Remove from quick links" : "Add to quick links"}
            aria-pressed={isBookmarked}
            disabled={!canBookmark}
            onClick={onToggleBookmark}
          >
            <Icon name="star" size={17} fill={isBookmarked ? "currentColor" : "none"} />
          </button>
        ) : null}
        {toolbarButtons.split ? (
          <button
            className="toolbar-icon"
            type="button"
            aria-label="Open split view"
            onClick={onOpenSplitView}
          >
            <Icon name="split" size={17} />
          </button>
        ) : null}
        {toolbarButtons.downloads ? (
          <button
            className={hasActiveDownload ? "toolbar-icon has-activity" : "toolbar-icon"}
            type="button"
            aria-label="Downloads"
            onClick={onToggleDownloads}
          >
            <Icon name="download" size={18} />
          </button>
        ) : null}
        {toolbarButtons.reader ? (
          <button
            className={isReaderOpen ? "toolbar-icon is-active" : "toolbar-icon"}
            type="button"
            aria-label="Reader mode"
            aria-pressed={isReaderOpen}
            title="Reader mode"
            disabled={isStartPage}
            onClick={onToggleReader}
          >
            <Icon name="reader" size={18} />
          </button>
        ) : null}
        {toolbarButtons.siteInfo ? (
          <button
            className={
              isSiteInfoOpen
                ? "toolbar-icon is-active"
                : !isStartPage && currentUrl.startsWith("http://")
                  ? "toolbar-icon is-insecure"
                  : "toolbar-icon"
            }
            type="button"
            aria-label="Site information"
            aria-expanded={isSiteInfoOpen}
            title="Site information"
            onClick={onToggleSiteInfo}
          >
            <Icon name="shield" size={18} />
          </button>
        ) : null}
        <span className="toolbar-sep" aria-hidden="true" />
        <button
          className="toolbar-icon"
          type="button"
          aria-label="Settings"
          onClick={onOpenSettings}
        >
          <Icon name="menu" size={19} />
        </button>
      </div>
    </header>
  );
}

export default memo(Toolbar);
