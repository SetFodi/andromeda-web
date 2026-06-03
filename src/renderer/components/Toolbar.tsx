import { memo, type RefObject } from "react";
import Icon from "./Icon";

type ToolbarProps = {
  addressValue: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onAddressChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onNewTab: () => void;
  onCloseWindow: () => void;
  onMinimizeWindow: () => void;
  onToggleMaximizeWindow: () => void;
};

function Toolbar({
  addressValue,
  inputRef,
  onAddressChange,
  onSubmit,
  onBack,
  onForward,
  onReload,
  onNewTab,
  onCloseWindow,
  onMinimizeWindow,
  onToggleMaximizeWindow
}: ToolbarProps) {
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
        <button className="toolbar-icon" type="button" aria-label="Back" onClick={onBack}>
          <Icon name="arrowLeft" size={18} />
        </button>
        <button className="toolbar-icon" type="button" aria-label="Forward" onClick={onForward}>
          <Icon name="arrowRight" size={18} />
        </button>
        <button className="toolbar-icon" type="button" aria-label="Reload" onClick={onReload}>
          <Icon name="reload" size={16} />
        </button>
      </div>

      <form
        className="address-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Icon className="address-search" name="search" size={17} />
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
          <Icon name="sparkle" size={17} />
        </button>
        <button className="toolbar-icon" type="button" aria-label="Security">
          <Icon name="shield" size={18} />
        </button>
        <button className="toolbar-icon" type="button" aria-label="Layout">
          <Icon name="square" size={17} />
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
