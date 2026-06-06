import { memo, useEffect, useState, type RefObject } from "react";
import Icon, { IconName } from "./Icon";

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
  theme: "light" | "dark";
  onAddressChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onNewTab: () => void;
  onOpenSplitView: () => void;
  onToggleTheme: () => void;
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
  onAddressChange,
  onSubmit,
  onBack,
  onForward,
  onReload,
  onNewTab,
  onOpenSplitView,
  onToggleTheme,
  onCloseWindow,
  onMinimizeWindow,
  onToggleMaximizeWindow
}: ToolbarProps) {
  const pageLabel = currentPageTitle.trim() || (isStartPage ? "Start" : "Browsing");
  const [failedFaviconUrl, setFailedFaviconUrl] = useState<string | null>(null);
  const showFavicon = Boolean(
    currentPageFaviconUrl && !isStartPage && currentPageFaviconUrl !== failedFaviconUrl
  );

  useEffect(() => {
    setFailedFaviconUrl(null);
  }, [currentPageFaviconUrl]);

  return (
    <header className="toolbar">
      <div className="traffic-lights" aria-label="Window controls">
        <button className="traffic traffic-close" type="button" onClick={onCloseWindow} />
        <button className="traffic traffic-minimize" type="button" onClick={onMinimizeWindow} />
        <button className="traffic traffic-maximize" type="button" onClick={onToggleMaximizeWindow} />
      </div>

      <button className="toolbar-icon sidebar-switch" type="button" aria-label="Toggle sidebar">
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
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </form>

      <div className="toolbar-actions" aria-label="Browser actions">
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
        <button className="toolbar-icon" type="button" aria-label="Security">
          <Icon name="shield" size={18} />
        </button>
        <span className="toolbar-sep" aria-hidden="true" />
        <button
          className="toolbar-icon theme-toggle"
          type="button"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={onToggleTheme}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
        </button>
        <button className="profile-badge" type="button" aria-label="Profile">
          A
        </button>
        <button className="toolbar-icon" type="button" aria-label="Menu">
          <Icon name="menu" size={19} />
        </button>
      </div>
    </header>
  );
}

export default memo(Toolbar);
