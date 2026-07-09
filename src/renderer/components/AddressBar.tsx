import { memo, useEffect, useMemo, useState, type RefObject } from "react";
import Icon, { IconName } from "./Icon";
import { getInlineCompletion } from "../utils/url";

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Hostname for the collapsed domain chip; "" when the value isn't URL-shaped
// (queries, empty) so the full field shows instead.
function getChipHost(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return "";
  }
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.hostname.includes(".") ? url.hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

type AddressBarProps = {
  variant: "toolbar" | "sidebar";
  addressValue: string;
  inputRef: RefObject<HTMLInputElement | null>;
  currentPageTitle: string;
  currentPageFaviconUrl?: string;
  currentPageIcon: IconName;
  isStartPage: boolean;
  isLoading: boolean;
  addressSuggestions: Array<{ id: string; title: string; url: string }>;
  showAddressSuggestions: boolean;
  zoomPercent: number | null;
  onResetZoom: () => void;
  onAddressChange: (value: string) => void;
  onAddressFocus: () => void;
  onAddressBlur: () => void;
  onAddressEscape: () => void;
  onPickSuggestion: (url: string) => void;
  onSubmit: () => void;
};

function AddressBar({
  variant,
  addressValue,
  inputRef,
  currentPageTitle,
  currentPageFaviconUrl,
  currentPageIcon,
  isStartPage,
  isLoading,
  addressSuggestions,
  showAddressSuggestions,
  zoomPercent,
  onResetZoom,
  onAddressChange,
  onAddressFocus,
  onAddressBlur,
  onAddressEscape,
  onPickSuggestion,
  onSubmit
}: AddressBarProps) {
  const pageLabel = currentPageTitle.trim() || (isStartPage ? "Start" : "Browsing");
  const [failedFaviconUrl, setFailedFaviconUrl] = useState<string | null>(null);
  const [suggestIndex, setSuggestIndex] = useState(-1);
  const [isEditing, setIsEditing] = useState(false);
  const showFavicon = Boolean(
    currentPageFaviconUrl && !isStartPage && currentPageFaviconUrl !== failedFaviconUrl
  );

  // Toolbar placement collapses to an Aside-style domain chip while browsing.
  // The real input stays mounted (hidden) so ⌘L focus flips straight into
  // editing via its onFocus handler.
  const chipHost = useMemo(() => getChipHost(addressValue), [addressValue]);
  const isChip = variant === "toolbar" && !isEditing && !isStartPage && chipHost !== "";

  useEffect(() => {
    setFailedFaviconUrl(null);
  }, [currentPageFaviconUrl]);

  // No suggestion is pre-selected; plain Enter keeps navigating to what was typed.
  useEffect(() => {
    setSuggestIndex(-1);
  }, [addressValue, showAddressSuggestions]);

  const completion = useMemo(
    () =>
      showAddressSuggestions
        ? getInlineCompletion(addressValue, addressSuggestions.map((suggestion) => suggestion.url))
        : null,
    [addressValue, addressSuggestions, showAddressSuggestions]
  );

  const className = [
    "address-form",
    variant === "sidebar" ? "is-sidebar" : "",
    isLoading ? "is-loading" : "",
    isChip ? "is-chip" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {isChip ? (
        <button
          type="button"
          className="address-chip"
          title={addressValue.trim()}
          aria-label={`Edit address — ${chipHost}`}
          onClick={() => {
            setIsEditing(true);
            requestAnimationFrame(() => {
              inputRef.current?.focus();
              inputRef.current?.select();
            });
          }}
        >
          {showFavicon ? (
            <img
              alt=""
              src={currentPageFaviconUrl}
              onError={() => setFailedFaviconUrl(currentPageFaviconUrl ?? null)}
            />
          ) : (
            <Icon name={currentPageIcon} size={14} />
          )}
          <span className="address-chip-host">{chipHost}</span>
        </button>
      ) : null}
      <span className="address-lead" title={pageLabel} aria-hidden="true">
        {showFavicon ? (
          <img
            alt=""
            src={currentPageFaviconUrl}
            onError={() => {
              setFailedFaviconUrl(currentPageFaviconUrl ?? null);
            }}
          />
        ) : (
          <Icon name={isStartPage ? "search" : currentPageIcon} size={15} />
        )}
      </span>
      <span className="address-input-field">
        {completion ? (
          <span className="address-completion" aria-hidden="true">
            <span className="address-completion-typed">{addressValue}</span>
            {completion.text.slice(addressValue.length)}
          </span>
        ) : null}
        <input
          ref={inputRef}
          value={addressValue}
          role="combobox"
          aria-expanded={showAddressSuggestions}
          aria-controls="andromeda-address-suggestions"
          aria-activedescendant={
            suggestIndex >= 0 && addressSuggestions[suggestIndex]
              ? `address-suggestion-${addressSuggestions[suggestIndex].id}`
              : undefined
          }
          aria-autocomplete="both"
          placeholder="Search or enter website"
          onChange={(event) => onAddressChange(event.target.value)}
          onFocus={() => {
            setIsEditing(true);
            onAddressFocus();
          }}
          onBlur={() => {
            setIsEditing(false);
            onAddressBlur();
          }}
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
            } else if (
              (event.key === "Tab" ||
                (event.key === "ArrowRight" &&
                  event.currentTarget.selectionStart === event.currentTarget.value.length &&
                  event.currentTarget.selectionEnd === event.currentTarget.value.length)) &&
              completion
            ) {
              event.preventDefault();
              onAddressChange(completion.text);
            } else if (event.key === "Enter") {
              if (suggestIndex >= 0) {
                event.preventDefault();
                const target = addressSuggestions[suggestIndex];
                if (target) {
                  onPickSuggestion(target.url);
                }
              } else if (completion) {
                event.preventDefault();
                onPickSuggestion(completion.url);
              }
            }
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </span>
      {zoomPercent !== null && zoomPercent !== 100 ? (
        <button type="button" className="zoom-chip" title="Reset zoom" onClick={onResetZoom}>
          {zoomPercent}%
        </button>
      ) : null}
      {showAddressSuggestions ? (
        <div
          id="andromeda-address-suggestions"
          className="address-suggest"
          role="listbox"
          aria-label="Address suggestions"
          onMouseDown={(event) => event.preventDefault()}
        >
          {addressSuggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              id={`address-suggestion-${suggestion.id}`}
              type="button"
              role="option"
              aria-selected={index === suggestIndex}
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
  );
}

export default memo(AddressBar);
