import { BrowserWindow, WebContentsView } from "electron";

export type ContentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserPane = "main" | "split";

export type ContentLayout = {
  main: ContentBounds;
  split?: ContentBounds | null;
};

type NavState = {
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
};

type MainTab = {
  view: WebContentsView;
  loadedUrl: string;
  attached: boolean;
  lastNav: NavState | null;
};

type SplitState = {
  view: WebContentsView | null;
  attached: boolean;
  bounds: ContentBounds;
  applied: ContentBounds | null;
  lastNav: NavState | null;
};

const DEFAULT_BOUNDS: ContentBounds = {
  x: 286,
  y: 56,
  width: 860,
  height: 640
};

function hasSameBounds(left: ContentBounds, right: ContentBounds): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function isLoadableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getFaviconUrl(favicons: string[]): string | null {
  return (
    favicons.find((favicon) => {
      try {
        const url = new URL(favicon);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }) ?? null
  );
}

/**
 * Hosts one live WebContentsView per browser tab in the "main" region, plus a
 * single optional "split" view. Inactive tab views stay alive but detached, so
 * switching tabs shows a kept-alive page instead of reloading it.
 */
export class WebContentsViewManager {
  private mainTabs = new Map<string, MainTab>();
  private activeMainTabId: string | null = null;
  private mainBounds: ContentBounds = { ...DEFAULT_BOUNDS };
  private split: SplitState = {
    view: null,
    attached: false,
    bounds: { ...DEFAULT_BOUNDS },
    applied: null,
    lastNav: null
  };
  private activePane: BrowserPane = "main";
  private overlayOpen = false;

  constructor(private readonly window: BrowserWindow) {}

  // ---- Main tabs --------------------------------------------------------
  showTab(tabId: string, url: string): void {
    if (!isLoadableUrl(url)) {
      return;
    }

    // Detach every other main view so only the target tab is ever visible.
    for (const [id, entry] of this.mainTabs) {
      if (id !== tabId && entry.attached) {
        this.window.contentView.removeChildView(entry.view);
        entry.attached = false;
      }
    }

    let entry = this.mainTabs.get(tabId);
    if (!entry) {
      const view = this.createMainView(tabId);
      entry = { view, loadedUrl: url, attached: false, lastNav: null };
      this.mainTabs.set(tabId, entry);
      void view.webContents.loadURL(url);
    } else if (entry.loadedUrl !== url) {
      entry.loadedUrl = url;
      void entry.view.webContents.loadURL(url);
    }

    this.activeMainTabId = tabId;
    this.activePane = "main";
    this.attachMain(tabId);
    this.emitMainNavState(tabId);
  }

  showStartPage(): void {
    // Detach every main view (not just the tracked active one) so the React
    // start page is never left with a stray page floating over it.
    for (const [, entry] of this.mainTabs) {
      if (entry.attached) {
        this.window.contentView.removeChildView(entry.view);
        entry.attached = false;
      }
    }
    this.activeMainTabId = null;
    this.activePane = "main";
  }

  pruneTabs(validTabIds: string[]): void {
    const valid = new Set(validTabIds);
    for (const [id, entry] of this.mainTabs) {
      if (valid.has(id)) {
        continue;
      }

      if (entry.attached) {
        this.window.contentView.removeChildView(entry.view);
      }
      entry.view.webContents.close();
      this.mainTabs.delete(id);
      if (this.activeMainTabId === id) {
        this.activeMainTabId = null;
      }
    }
  }

  private createMainView(tabId: string): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isLoadableUrl(url)) {
        this.window.webContents.send("browser:openTab", { url });
      }
      return { action: "deny" };
    });

    view.webContents.on("before-input-event", (_event, input) => {
      if (input.type === "keyDown") {
        this.activeMainTabId = tabId;
        this.activePane = "main";
      }
    });

    view.webContents.on("focus", () => {
      this.activeMainTabId = tabId;
      this.activePane = "main";
      this.window.webContents.send("browser:paneFocused", { pane: "main" });
    });

    const handleNavigation = (url: string) => {
      const entry = this.mainTabs.get(tabId);
      if (entry) {
        entry.loadedUrl = url;
      }
      if (isLoadableUrl(url)) {
        this.window.webContents.send("browser:tabNavigated", { tabId, url });
      }
      this.emitMainNavState(tabId);
    };

    view.webContents.on("did-navigate", (_event, url) => handleNavigation(url));
    view.webContents.on("did-navigate-in-page", (_event, url) => handleNavigation(url));
    view.webContents.on("did-start-loading", () => this.emitMainNavState(tabId));
    view.webContents.on("did-stop-loading", () => this.emitMainNavState(tabId));
    view.webContents.on("did-fail-load", () => this.emitMainNavState(tabId));

    view.webContents.on("page-title-updated", (_event, title) => {
      this.window.webContents.send("browser:tabTitle", { tabId, title });
    });

    view.webContents.on("page-favicon-updated", (_event, favicons) => {
      const faviconUrl = getFaviconUrl(favicons);
      if (faviconUrl) {
        this.window.webContents.send("browser:tabFavicon", { tabId, faviconUrl });
      }
    });

    view.webContents.on("found-in-page", (_event, result) => {
      if (this.activeMainTabId === tabId) {
        this.window.webContents.send("browser:foundInPage", {
          pane: "main",
          activeMatchOrdinal: result.activeMatchOrdinal,
          matches: result.matches
        });
      }
    });

    return view;
  }

  private attachMain(tabId: string): void {
    const entry = this.mainTabs.get(tabId);
    if (!entry || this.overlayOpen) {
      return;
    }

    if (!entry.attached) {
      this.window.contentView.addChildView(entry.view);
      entry.attached = true;
    }
    entry.view.setBounds(this.mainBounds);
  }

  private activeMainView(): WebContentsView | null {
    if (!this.activeMainTabId) {
      return null;
    }
    return this.mainTabs.get(this.activeMainTabId)?.view ?? null;
  }

  private emitMainNavState(tabId: string): void {
    const entry = this.mainTabs.get(tabId);
    if (!entry || this.activeMainTabId !== tabId) {
      return;
    }

    const navState: NavState = {
      canGoBack: entry.view.webContents.navigationHistory.canGoBack(),
      canGoForward: entry.view.webContents.navigationHistory.canGoForward(),
      isLoading: entry.view.webContents.isLoading()
    };

    if (
      entry.lastNav &&
      entry.lastNav.canGoBack === navState.canGoBack &&
      entry.lastNav.canGoForward === navState.canGoForward &&
      entry.lastNav.isLoading === navState.isLoading
    ) {
      return;
    }

    entry.lastNav = navState;
    this.window.webContents.send("browser:tabNavState", { tabId, ...navState });
  }

  // ---- Split pane (single view) ----------------------------------------
  navigate(url: string, pane: BrowserPane = "split"): void {
    if (pane !== "split") {
      return;
    }

    if (!isLoadableUrl(url)) {
      throw new Error("Unsupported navigation URL");
    }

    const view = this.ensureSplitView();
    this.activePane = "split";
    this.applySplitBounds();
    if (view.webContents.getURL() === url) {
      return;
    }
    void view.webContents.loadURL(url);
  }

  closeSplitView(): void {
    if (this.split.view) {
      if (this.split.attached) {
        this.window.contentView.removeChildView(this.split.view);
      }
      this.split.view.webContents.close();
      this.split.view = null;
      this.split.attached = false;
      this.split.applied = null;
      this.split.lastNav = null;
    }
    this.activePane = "main";
    this.sendSplitNavState();
  }

  private ensureSplitView(): WebContentsView {
    if (this.split.view) {
      if (!this.split.attached && !this.overlayOpen) {
        this.window.contentView.addChildView(this.split.view);
        this.split.attached = true;
        this.applySplitBounds();
      }
      return this.split.view;
    }

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isLoadableUrl(url)) {
        this.navigate(url, "split");
      }
      return { action: "deny" };
    });

    view.webContents.on("before-input-event", (_event, input) => {
      if (input.type === "keyDown") {
        this.activePane = "split";
      }
    });

    view.webContents.on("focus", () => {
      this.activePane = "split";
      this.window.webContents.send("browser:paneFocused", { pane: "split" });
    });

    view.webContents.on("did-navigate", (_event, url) => {
      this.sendSplitNavigation(url);
      this.sendSplitNavState();
    });
    view.webContents.on("did-navigate-in-page", (_event, url) => {
      this.sendSplitNavigation(url);
      this.sendSplitNavState();
    });
    view.webContents.on("did-start-loading", () => this.sendSplitNavState());
    view.webContents.on("did-stop-loading", () => this.sendSplitNavState());
    view.webContents.on("did-fail-load", () => this.sendSplitNavState());
    view.webContents.on("page-title-updated", (_event, title) => {
      this.window.webContents.send("browser:titleUpdated", { pane: "split", title });
    });
    view.webContents.on("page-favicon-updated", (_event, favicons) => {
      const faviconUrl = getFaviconUrl(favicons);
      if (faviconUrl) {
        this.window.webContents.send("browser:faviconUpdated", { pane: "split", faviconUrl });
      }
    });
    view.webContents.on("found-in-page", (_event, result) => {
      if (this.activePane === "split") {
        this.window.webContents.send("browser:foundInPage", {
          pane: "split",
          activeMatchOrdinal: result.activeMatchOrdinal,
          matches: result.matches
        });
      }
    });

    this.window.contentView.addChildView(view);
    this.split.view = view;
    this.split.attached = true;
    this.sendSplitNavState();
    return view;
  }

  private applySplitBounds(): void {
    if (!this.split.view || !this.split.attached) {
      return;
    }
    if (this.split.applied && hasSameBounds(this.split.applied, this.split.bounds)) {
      return;
    }
    this.split.view.setBounds(this.split.bounds);
    this.split.applied = { ...this.split.bounds };
  }

  private sendSplitNavigation(url: string): void {
    if (isLoadableUrl(url)) {
      this.window.webContents.send("browser:didNavigate", { pane: "split", url });
    }
  }

  private sendSplitNavState(): void {
    const view = this.split.view;
    const navState: NavState = {
      canGoBack: Boolean(view?.webContents.navigationHistory.canGoBack()),
      canGoForward: Boolean(view?.webContents.navigationHistory.canGoForward()),
      isLoading: Boolean(view?.webContents.isLoading())
    };

    if (
      this.split.lastNav &&
      this.split.lastNav.canGoBack === navState.canGoBack &&
      this.split.lastNav.canGoForward === navState.canGoForward &&
      this.split.lastNav.isLoading === navState.isLoading
    ) {
      return;
    }

    this.split.lastNav = navState;
    this.window.webContents.send("browser:navigationStateUpdated", { pane: "split", ...navState });
  }

  // ---- Shared pane operations ------------------------------------------
  private paneView(pane: BrowserPane): WebContentsView | null {
    return pane === "split" ? this.split.view : this.activeMainView();
  }

  setActivePane(pane: BrowserPane): void {
    if (pane === "split" && !this.split.view) {
      return;
    }
    this.activePane = pane;
  }

  goBack(pane: BrowserPane = this.activePane): void {
    const view = this.paneView(pane);
    if (view?.webContents.navigationHistory.canGoBack()) {
      this.activePane = pane;
      view.webContents.navigationHistory.goBack();
    }
  }

  goForward(pane: BrowserPane = this.activePane): void {
    const view = this.paneView(pane);
    if (view?.webContents.navigationHistory.canGoForward()) {
      this.activePane = pane;
      view.webContents.navigationHistory.goForward();
    }
  }

  reload(pane: BrowserPane = this.activePane): void {
    const view = this.paneView(pane);
    if (view) {
      this.activePane = pane;
      view.webContents.reload();
    }
  }

  findInPage(pane: BrowserPane, text: string, options: { forward: boolean; findNext: boolean }): void {
    if (!text) {
      return;
    }
    this.paneView(pane)?.webContents.findInPage(text, {
      forward: options.forward,
      findNext: options.findNext
    });
  }

  stopFind(pane: BrowserPane): void {
    this.paneView(pane)?.webContents.stopFindInPage("clearSelection");
  }

  adjustZoom(pane: BrowserPane, direction: "in" | "out" | "reset"): void {
    const view = this.paneView(pane);
    if (!view) {
      return;
    }

    const webContents = view.webContents;
    if (direction === "reset") {
      webContents.setZoomLevel(0);
      return;
    }

    const step = direction === "in" ? 0.5 : -0.5;
    const next = Math.max(-3, Math.min(5, webContents.getZoomLevel() + step));
    webContents.setZoomLevel(next);
  }

  resize(layout: ContentLayout): void {
    this.mainBounds = layout.main;
    const activeView = this.activeMainView();
    if (activeView && !this.overlayOpen) {
      activeView.setBounds(this.mainBounds);
    }

    if (layout.split) {
      this.split.bounds = layout.split;
      this.applySplitBounds();
    }
  }

  setCommandBarOpen(isOpen: boolean): void {
    this.overlayOpen = isOpen;

    if (isOpen) {
      for (const [, entry] of this.mainTabs) {
        if (entry.attached) {
          this.window.contentView.removeChildView(entry.view);
          entry.attached = false;
        }
      }
      if (this.split.view && this.split.attached) {
        this.window.contentView.removeChildView(this.split.view);
        this.split.attached = false;
      }
      return;
    }

    if (this.activeMainTabId) {
      this.attachMain(this.activeMainTabId);
    }
    if (this.split.view && !this.split.attached) {
      this.window.contentView.addChildView(this.split.view);
      this.split.attached = true;
      this.applySplitBounds();
    }
  }
}
