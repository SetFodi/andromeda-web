import { ipcRenderer } from "electron";

/**
 * Runs in every web view's main frame (sandboxed, context-isolated; nothing is
 * exposed to the page). Two jobs:
 *  - capture submitted logins and offer them to the main process
 *  - fill saved credentials into login forms
 * The origin is never sent from here — main derives it from the sender frame.
 */

type AutofillAccount = {
  id: string;
  username: string;
};

type FillResult = {
  username: string;
  password: string;
};

const CHANNEL_CANDIDATE = "page:passwordCandidate";
const CHANNEL_REQUEST_FILL = "page:requestAutofill";
const CHANNEL_FILL = "page:fillCredential";

const KEY_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>';

const PICKER_CSS = `
:host { all: initial; }
.menu {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.12);
  padding: 5px;
  animation: af-in 120ms ease;
}
@keyframes af-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.head {
  padding: 7px 9px 6px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #8a8a8e;
}
.item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #1d1d1f;
  font-size: 13.5px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.item:hover, .item:focus-visible { background: #f0eef4; outline: none; }
.item svg { flex: 0 0 auto; color: #d2683f; }
.label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

if (location.protocol === "https:" || location.protocol === "http:") {
  setupPasswordAutofill();
  setupLinkHoverPill();
}

function setupPasswordAutofill(): void {
  let lastCapturedSignature = "";

  function isFillableInput(input: HTMLInputElement): boolean {
    // Skip honeypots and template fragments that aren't really on screen.
    return !input.disabled && !input.readOnly && input.offsetParent !== null;
  }

  function findPasswordInput(root: ParentNode): HTMLInputElement | null {
    for (const input of root.querySelectorAll<HTMLInputElement>('input[type="password"]')) {
      if (isFillableInput(input)) {
        return input;
      }
    }
    return null;
  }

  function findUsernameInput(password: HTMLInputElement): HTMLInputElement | null {
    const scope: ParentNode = password.closest("form") ?? document;
    const candidates = Array.from(
      scope.querySelectorAll<HTMLInputElement>(
        'input[type="email"], input[type="text"], input[type="tel"], input:not([type])'
      )
    ).filter(
      (input) =>
        isFillableInput(input) &&
        Boolean(input.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING)
    );

    if (candidates.length === 0) {
      return null;
    }

    const labelled = candidates.find((input) =>
      /username|email|user|login/i.test(
        `${input.autocomplete} ${input.name} ${input.id} ${input.getAttribute("aria-label") ?? ""}`
      )
    );

    // Otherwise the field immediately above the password is the best guess.
    return labelled ?? candidates[candidates.length - 1];
  }

  function captureCandidate(): void {
    // Use any password input that has a value, visible or not — some sites
    // hide the field the instant the user submits.
    let password: HTMLInputElement | null = null;
    for (const input of document.querySelectorAll<HTMLInputElement>('input[type="password"]')) {
      if (input.value) {
        password = input;
        break;
      }
    }
    if (!password) {
      return;
    }

    const username = findUsernameInput(password)?.value.trim() ?? "";
    const signature = `${username}\u0000${password.value}`;
    if (signature === lastCapturedSignature) {
      return;
    }
    lastCapturedSignature = signature;

    ipcRenderer.send(CHANNEL_CANDIDATE, { username, password: password.value });
  }

  document.addEventListener("submit", () => captureCandidate(), true);

  document.addEventListener(
    "keydown",
    (event) => {
      const target = event.target as HTMLInputElement | null;
      if (event.key === "Enter" && target?.type === "password") {
        captureCandidate();
      }
    },
    true
  );

  // Fetch-based logins never fire a submit event; a click on anything
  // button-shaped while a password field holds a value is the cue.
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element | null;
      if (target?.closest?.('button, input[type="submit"], [role="button"]')) {
        captureCandidate();
      }
    },
    true
  );

  function setNativeValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) {
      return;
    }
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // The saved logins for this origin, fetched at most once (null = not asked).
  let cachedAccounts: AutofillAccount[] | null = null;
  let offerInFlight = false;
  let pickerHost: HTMLElement | null = null;
  let pickerCleanup: (() => void) | null = null;

  function closePicker(): void {
    pickerCleanup?.();
    pickerCleanup = null;
    pickerHost?.remove();
    pickerHost = null;
  }

  function openPicker(anchor: HTMLElement, accounts: AutofillAccount[]): void {
    closePicker();

    const host = document.createElement("div");
    host.setAttribute("data-andromeda-autofill", "");
    const rect = anchor.getBoundingClientRect();
    host.style.cssText = [
      "position:fixed",
      `left:${Math.round(rect.left)}px`,
      `top:${Math.round(rect.bottom + 5)}px`,
      "z-index:2147483647",
      `min-width:${Math.max(Math.round(rect.width), 230)}px`,
      "max-width:340px"
    ].join(";");

    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = PICKER_CSS;
    const menu = document.createElement("div");
    menu.className = "menu";

    const header = document.createElement("div");
    header.className = "head";
    header.textContent = `Saved logins · ${location.hostname.replace(/^www\./, "")}`;
    menu.appendChild(header);

    for (const account of accounts) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "item";
      item.innerHTML = KEY_SVG;
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = account.username || "Saved login";
      item.appendChild(label);
      item.addEventListener("click", () => {
        closePicker();
        void fillById(account.id, true);
      });
      menu.appendChild(item);
    }

    shadow.appendChild(style);
    shadow.appendChild(menu);
    (document.body ?? document.documentElement).appendChild(host);
    pickerHost = host;

    const onOutside = (event: Event) => {
      if (!event.composedPath().includes(host)) {
        closePicker();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePicker();
      }
    };
    // Defer so the focus/click that opened the picker doesn't immediately close it.
    const armTimer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onOutside, true);
    }, 0);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", closePicker);
    document.addEventListener("scroll", closePicker, true);

    pickerCleanup = () => {
      window.clearTimeout(armTimer);
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", closePicker);
      document.removeEventListener("scroll", closePicker, true);
    };
  }

  async function fillById(id: string, force = false): Promise<void> {
    let credential: FillResult | null = null;
    try {
      credential = (await ipcRenderer.invoke(CHANNEL_FILL, { id })) as FillResult | null;
    } catch {
      credential = null;
    }
    if (!credential) {
      return;
    }

    const password = findPasswordInput(document);
    if (!password || (password.value && !force)) {
      return;
    }

    setNativeValue(password, credential.password);
    const username = findUsernameInput(password);
    if (username && (!username.value || force) && credential.username) {
      setNativeValue(username, credential.username);
    }
  }

  async function getAccounts(): Promise<AutofillAccount[]> {
    if (cachedAccounts) {
      return cachedAccounts;
    }
    try {
      const result = await ipcRenderer.invoke(CHANNEL_REQUEST_FILL);
      cachedAccounts = Array.isArray(result) ? (result as AutofillAccount[]) : [];
    } catch {
      cachedAccounts = [];
    }
    return cachedAccounts;
  }

  // A genuine user gesture (click / keypress / tab) sets user activation;
  // a page calling input.focus() programmatically does not. We require it
  // before silently injecting a password so an off-screen or attacker-built
  // form cannot harvest a saved credential with no interaction.
  function hasUserActivation(): boolean {
    return Boolean(navigator.userActivation?.hasBeenActive);
  }

  // Offers saved logins for the current form: fills a lone login silently only
  // on a genuine focus gesture, otherwise surfaces the picker.
  async function offerFill(userInitiated: boolean): Promise<void> {
    if (offerInFlight || pickerHost) {
      return;
    }

    const password = findPasswordInput(document);
    if (!password || password.value) {
      return;
    }

    offerInFlight = true;
    const accounts = await getAccounts();
    offerInFlight = false;

    if (accounts.length === 0) {
      return;
    }

    // Re-resolve the form: SPAs can re-render while the IPC round-trip runs.
    const livePassword = findPasswordInput(document);
    if (!livePassword || livePassword.value) {
      return;
    }

    // Silently fill a lone saved login ONLY in response to a real user gesture
    // (focusing the field after interacting). Page-load and mutation-driven
    // offers always go through the visible picker instead.
    if (accounts.length === 1 && userInitiated && hasUserActivation()) {
      await fillById(accounts[0].id);
      return;
    }

    const anchor = findUsernameInput(livePassword) ?? livePassword;
    openPicker(anchor, accounts);
  }

  function watchForLoginForms(): void {
    let autoOffered = false;
    const offerOnce = () => {
      if (autoOffered) {
        return;
      }
      autoOffered = true;
      void offerFill(false);
    };

    if (findPasswordInput(document)) {
      offerOnce();
    }

    // Login forms that render late (SPAs, modals).
    const observer = new MutationObserver(() => {
      if (autoOffered) {
        observer.disconnect();
        return;
      }
      if (findPasswordInput(document)) {
        offerOnce();
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 30000);

    // Focusing an empty login field re-offers — covers modals opened later and
    // re-opening the picker after it was dismissed.
    document.addEventListener(
      "focusin",
      (event) => {
        const target = event.target as HTMLInputElement | null;
        if (!target || pickerHost) {
          return;
        }
        const password = findPasswordInput(document);
        if (!password || password.value) {
          return;
        }
        if (target === password || target === findUsernameInput(password)) {
          void offerFill(true);
        }
      },
      true
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => watchForLoginForms(), { once: true });
  } else {
    watchForLoginForms();
  }
}

/**
 * Link-hover URL pill: a small floating chip in the page's bottom-left corner
 * showing the destination of the hovered link (Aside-style, replaces a status
 * bar). Rendered inside the page via a closed shadow root so page CSS can't
 * restyle it and nothing is exposed. Native web views composite above the
 * renderer chrome, so this must live in-page — the React shell can't draw it.
 */
function setupLinkHoverPill(): void {
  const SHOW_DELAY_MS = 150;
  const EDGE_AVOID_PX = 56;

  let host: HTMLDivElement | null = null;
  let pill: HTMLSpanElement | null = null;
  let showTimer = 0;
  let currentUrl = "";

  function ensurePill(): HTMLSpanElement | null {
    if (pill) {
      return pill;
    }
    if (!document.documentElement) {
      return null;
    }

    host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:0;bottom:0;z-index:2147483647;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .pill {
        position: fixed;
        left: 12px;
        bottom: 10px;
        display: block;
        max-width: min(64vw, 720px);
        padding: 5px 12px;
        border: 1px solid rgba(255, 205, 180, 0.16);
        border-radius: 999px;
        background: rgba(28, 20, 16, 0.92);
        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.34);
        color: #ece2d9;
        font: 500 11.5px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0.005em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        opacity: 0;
        transform: translateY(3px);
        transition: opacity 130ms ease, transform 130ms ease;
      }
      .pill.is-visible { opacity: 1; transform: none; }
      .pill.is-right { left: auto; right: 12px; }
    `;
    pill = document.createElement("span");
    pill.className = "pill";
    shadow.append(style, pill);
    document.documentElement.appendChild(host);
    return pill;
  }

  function formatTarget(href: string): string {
    try {
      const url = new URL(href, location.href);
      if (url.protocol === "mailto:") {
        return href;
      }
      const path = `${url.pathname}${url.search}${url.hash}`;
      return `${url.hostname.replace(/^www\./, "")}${path === "/" ? "" : path}`;
    } catch {
      return href;
    }
  }

  function hide(): void {
    window.clearTimeout(showTimer);
    showTimer = 0;
    currentUrl = "";
    pill?.classList.remove("is-visible");
  }

  function show(href: string, pointerX: number, pointerY: number): void {
    const target = ensurePill();
    if (!target) {
      return;
    }

    currentUrl = href;
    window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => {
      if (currentUrl !== href) {
        return;
      }
      target.textContent = formatTarget(href);
      // Dodge the corner the cursor is in so the pill never sits under it.
      const nearLeftBottom =
        pointerY > window.innerHeight - EDGE_AVOID_PX && pointerX < window.innerWidth * 0.45;
      target.classList.toggle("is-right", nearLeftBottom);
      target.classList.add("is-visible");
    }, SHOW_DELAY_MS);
  }

  document.addEventListener(
    "mouseover",
    (event) => {
      const element = event.target instanceof Element ? event.target : null;
      const anchor = element?.closest("a[href]");
      const href = anchor?.getAttribute("href")?.trim();
      if (!anchor || !href || href.startsWith("javascript:") || href === "#") {
        hide();
        return;
      }
      show((anchor as HTMLAnchorElement).href || href, event.clientX, event.clientY);
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (event) => {
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest("a[href]")) {
        hide();
      }
    },
    true
  );

  document.addEventListener("mousedown", hide, true);
  window.addEventListener("blur", hide);
  window.addEventListener("pagehide", hide);
}
