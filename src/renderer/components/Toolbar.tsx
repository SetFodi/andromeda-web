import { memo, useEffect, useState, type RefObject } from "react";
import Icon, { IconName } from "./Icon";
import type { ThemeMode } from "../state/useTheme";

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type ToolbarProps = {
  addressValue: string;
  inputRef: RefObject<HTMLInputElement | null>;
  currentPageTitle: string;
  currentPageFaviconUrl?: string;
  currentPageIcon: IconName;
  isStartPage: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  theme: ThemeMode;
  isSidebarCollapsed: boolean;
  canBookmark: boolean;
  isBookmarked: boolean;
  hasActiveDownload: boolean;
  profileInitial: string;
  currentUrl: string;
  isSiteInfoOpen: boolean;
  isReaderOpen: boolean;
  addressSuggestions: Array<{ id: string; title: string; url: string }>;
  showAddressSuggestions: boolean;
  zoomPercent: number | null;
  savePasswordPrompt: SavePasswordPromptPayload | null;
  onRespondSavePassword: (action: "save" | "never" | "dismiss") => void;
  onResetZoom: () => void;
  onAddressChange: (value: string) => void;
  onAddressFocus: () => void;
  onAddressBlur: () => void;
  onAddressEscape: () => void;
  onPickSuggestion: (url: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onOpenSplitView: () => void;
  onToggleBookmark: () => void;
  onToggleDownloads: () => void;
  onToggleSiteInfo: () => void;
  onToggleReader: () => void;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  onCloseWindow: () => void;
  onMinimizeWindow: () => void;
  onToggleMaximizeWindow: () => void;
};

function Toolbar({
  addressValue,
  inputRef,
  currentPageTitle,
  currentPageFaviconUrl,
  currentPageIcon,
  isStartPage,
  canGoBack,
  canGoForward,
  isLoading,
  theme,
  isSidebarCollapsed,
  canBookmark,
  isBookmarked,
  hasActiveDownload,
  profileInitial,
  currentUrl,
  isSiteInfoOpen,
  isReaderOpen,
  addressSuggestions,
  showAddressSuggestions,
  zoomPercent,
  savePasswordPrompt,
  onRespondSavePassword,
  onResetZoom,
  onAddressChange,
  onAddressFocus,
  onAddressBlur,
  onAddressEscape,
  onPickSuggestion,
  onSubmit,
  onBack,
  onForward,
  onReload,
  onOpenSplitView,
  onToggleBookmark,
  onToggleDownloads,
  onToggleSiteInfo,
  onToggleReader,
  onToggleTheme,
  onToggleSidebar,
  onOpenSettings,
  onCloseWindow,
  onMinimizeWindow,
  onToggleMaximizeWindow
}: ToolbarProps) {
  const pageLabel = currentPageTitle.trim() || (isStartPage ? "Start" : "Browsing");
  const [failedFaviconUrl, setFailedFaviconUrl] = useState<string | null>(null);
  const [suggestIndex, setSuggestIndex] = useState(-1);
  const showFavicon = Boolean(
    currentPageFaviconUrl && !isStartPage && currentPageFaviconUrl !== failedFaviconUrl
  );
  const themeIcon: IconName = theme === "day" ? "sun" : theme === "night" ? "moon" : "sparkle";

  useEffect(() => {
    setFailedFaviconUrl(null);
  }, [currentPageFaviconUrl]);

  // No suggestion is pre-selected; plain Enter keeps navigating to what was typed.
  useEffect(() => {
    setSuggestIndex(-1);
  }, [addressValue, showAddressSuggestions]);

  return (
    <header className="toolbar">
      {isLoading ? <span className="toolbar-progress" aria-hidden="true" /> : null}
      <div className="traffic-lights" aria-label="Window controls">
        <button className="traffic traffic-close" type="button" onClick={onCloseWindow} />
        <button className="traffic traffic-minimize" type="button" onClick={onMinimizeWindow} />
        <button className="traffic traffic-maximize" type="button" onClick={onToggleMaximizeWindow} />
      </div>

      <button
        className={isSidebarCollapsed ? "toolbar-icon sidebar-switch is-active" : "toolbar-icon sidebar-switch"}
        type="button"
        aria-label="Toggle sidebar"
        aria-pressed={isSidebarCollapsed}
        onClick={onToggleSidebar}
      >
        <Icon name="panel" size={18} />
      </button>

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

      <form
        className={isLoading ? "address-form is-loading" : "address-form"}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <span className="page-identity" title={pageLabel}>
          {showFavicon ? (
            <img
              alt=""
              src={currentPageFaviconUrl}
              onError={() => {
                setFailedFaviconUrl(currentPageFaviconUrl ?? null);
              }}
            />
          ) : (
            <Icon name={currentPageIcon} size={15} />
          )}
          <span>{pageLabel}</span>
        </span>
        <span className="address-divider" />
        <input
          ref={inputRef}
          value={addressValue}
          placeholder="Search or enter website"
          onChange={(event) => onAddressChange(event.target.value)}
          onFocus={onAddressFocus}
          onBlur={onAddressBlur}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onAddressEscape();
              event.currentTarget.blur();
              return;
            }

            if (!showAddressSuggestions || addressSuggestions.length === 0) {
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSuggestIndex((current) => (current + 1) % addressSuggestions.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSuggestIndex((current) =>
                current <= 0 ? addressSuggestions.length - 1 : current - 1
              );
            } else if (event.key === "Enter" && suggestIndex >= 0) {
              event.preventDefault();
              const target = addressSuggestions[suggestIndex];
              if (target) {
                onPickSuggestion(target.url);
              }
            }
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        {zoomPercent !== null && zoomPercent !== 100 ? (
          <button type="button" className="zoom-chip" title="Reset zoom" onClick={onResetZoom}>
            {zoomPercent}%
          </button>
        ) : null}
        {showAddressSuggestions ? (
          <div className="address-suggest" onMouseDown={(event) => event.preventDefault()}>
            {addressSuggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                type="button"
                className={
                  index === suggestIndex
                    ? "address-suggest-item is-selected"
                    : "address-suggest-item"
                }
                onMouseEnter={() => setSuggestIndex(index)}
                onClick={() => onPickSuggestion(suggestion.url)}
              >
                <Icon name="history" size={14} />
                <span className="address-suggest-title">{suggestion.title}</span>
                <span className="address-suggest-host">{getHostname(suggestion.url)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </form>

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
        <button
          className="toolbar-icon"
          type="button"
          aria-label="Open split view"
          onClick={onOpenSplitView}
        >
          <Icon name="split" size={17} />
        </button>
        <button
          className={hasActiveDownload ? "toolbar-icon has-activity" : "toolbar-icon"}
          type="button"
          aria-label="Downloads"
          onClick={onToggleDownloads}
        >
          <Icon name="download" size={18} />
        </button>
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
        <span className="toolbar-sep" aria-hidden="true" />
        <button
          className="toolbar-icon theme-toggle"
          type="button"
          aria-label="Cycle appearance"
          title="Cycle appearance"
          onClick={onToggleTheme}
        >
          <Icon name={themeIcon} size={17} />
        </button>
        <button className="profile-badge" type="button" aria-label="Profile">
          {profileInitial}
        </button>
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
