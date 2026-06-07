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
  addressSuggestions: Array<{ id: string; title: string; url: string }>;
  showAddressSuggestions: boolean;
  onAddressChange: (value: string) => void;
  onAddressFocus: () => void;
  onAddressBlur: () => void;
  onPickSuggestion: (url: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onNewTab: () => void;
  onOpenSplitView: () => void;
  onToggleBookmark: () => void;
  onToggleDownloads: () => void;
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
  addressSuggestions,
  showAddressSuggestions,
  onAddressChange,
  onAddressFocus,
  onAddressBlur,
  onPickSuggestion,
  onSubmit,
  onBack,
  onForward,
  onReload,
  onNewTab,
  onOpenSplitView,
  onToggleBookmark,
  onToggleDownloads,
  onToggleTheme,
  onToggleSidebar,
  onOpenSettings,
  onCloseWindow,
  onMinimizeWindow,
  onToggleMaximizeWindow
}: ToolbarProps) {
  const pageLabel = currentPageTitle.trim() || (isStartPage ? "Start" : "Browsing");
  const [failedFaviconUrl, setFailedFaviconUrl] = useState<string | null>(null);
  const showFavicon = Boolean(
    currentPageFaviconUrl && !isStartPage && currentPageFaviconUrl !== failedFaviconUrl
  );
  const themeIcon: IconName = theme === "day" ? "sun" : theme === "night" ? "moon" : "sparkle";

  useEffect(() => {
    setFailedFaviconUrl(null);
  }, [currentPageFaviconUrl]);

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
              event.currentTarget.blur();
            }
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        {showAddressSuggestions ? (
          <div className="address-suggest" onMouseDown={(event) => event.preventDefault()}>
            {addressSuggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                className="address-suggest-item"
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
        <button className="toolbar-icon" type="button" aria-label="New tab" onClick={onNewTab}>
          <Icon name="plus" size={18} />
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
        <button className="toolbar-icon" type="button" aria-label="Security">
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
          A
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
