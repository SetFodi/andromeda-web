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

type NavigationState = {
  pane: BrowserPane;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
};

type PaneState = {
  view: WebContentsView | null;
  isAttached: boolean;
  bounds: ContentBounds;
  appliedBounds: ContentBounds | null;
};

const DEFAULT_BOUNDS: ContentBounds = {
  x: 270,
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

export class WebContentsViewManager {
  private panes: Record<BrowserPane, PaneState> = {
    main: this.createPaneState(),
    split: this.createPaneState()
  };
  private activePane: BrowserPane = "main";
  private lastNavigationStates: Record<BrowserPane, NavigationState | null> = {
    main: null,
    split: null
  };

  constructor(private readonly window: BrowserWindow) {}

  navigate(url: string, pane: BrowserPane = "main"): void {
    if (!isLoadableUrl(url)) {
      throw new Error("Unsupported navigation URL");
    }

    const view = this.ensureView(pane);
    this.activePane = pane;
    this.applyBounds(pane);
    if (view.webContents.getURL() === url) {
      return;
    }

    void view.webContents.loadURL(url);
  }

  showStartPage(): void {
    this.closePane("split");
    this.closePane("main");
    this.activePane = "main";
  }

  closeSplitView(): void {
    this.closePane("split");
    this.activePane = "main";
    this.applyBounds("main");
  }

  resize(layout: ContentLayout): void {
    this.updatePaneBounds("main", layout.main);

    if (layout.split) {
      this.updatePaneBounds("split", layout.split);
    }
  }

  setActivePane(pane: BrowserPane): void {
    if (pane === "split" && !this.panes.split.view) {
      return;
    }

    this.activePane = pane;
  }

  goBack(pane: BrowserPane = this.activePane): void {
    const view = this.panes[pane].view;
    if (view?.webContents.navigationHistory.canGoBack()) {
      this.activePane = pane;
      view.webContents.navigationHistory.goBack();
    }
  }

  goForward(pane: BrowserPane = this.activePane): void {
    const view = this.panes[pane].view;
    if (view?.webContents.navigationHistory.canGoForward()) {
      this.activePane = pane;
      view.webContents.navigationHistory.goForward();
    }
  }

  reload(pane: BrowserPane = this.activePane): void {
    const view = this.panes[pane].view;
    if (view) {
      this.activePane = pane;
      view.webContents.reload();
    }
  }

  findInPage(pane: BrowserPane, text: string, options: { forward: boolean; findNext: boolean }): void {
    if (!text) {
      return;
    }

    const view = this.panes[pane].view;
    view?.webContents.findInPage(text, { forward: options.forward, findNext: options.findNext });
  }

  stopFind(pane: BrowserPane): void {
    const view = this.panes[pane].view;
    view?.webContents.stopFindInPage("clearSelection");
  }

  adjustZoom(pane: BrowserPane, direction: "in" | "out" | "reset"): void {
    const view = this.panes[pane].view;
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

  setCommandBarOpen(isOpen: boolean): void {
    (["main", "split"] as BrowserPane[]).forEach((pane) => {
      const paneState = this.panes[pane];
      if (!paneState.view) {
        return;
      }

      if (isOpen && paneState.isAttached) {
        this.window.contentView.removeChildView(paneState.view);
        paneState.isAttached = false;
        return;
      }

      if (!isOpen && !paneState.isAttached) {
        this.window.contentView.addChildView(paneState.view);
        paneState.isAttached = true;
        this.applyBounds(pane);
      }
    });
  }

  private createPaneState(): PaneState {
    return {
      view: null,
      isAttached: false,
      bounds: { ...DEFAULT_BOUNDS },
      appliedBounds: null
    };
  }

  private ensureView(pane: BrowserPane): WebContentsView {
    const paneState = this.panes[pane];
    if (paneState.view) {
      if (!paneState.isAttached) {
        this.window.contentView.addChildView(paneState.view);
        paneState.isAttached = true;
        this.applyBounds(pane);
      }

      return paneState.view;
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
        this.navigate(url, pane);
      }

      return { action: "deny" };
    });

    view.webContents.on("before-input-event", (_event, input) => {
      // Track which pane the user is interacting with. App-level shortcuts are
      // handled by the native menu, so we no longer intercept keys here.
      if (input.type === "keyDown") {
        this.setActivePane(pane);
      }
    });

    view.webContents.on("found-in-page", (_event, result) => {
      this.window.webContents.send("browser:foundInPage", {
        pane,
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches
      });
    });

    view.webContents.on("focus", () => {
      this.activePane = pane;
      this.window.webContents.send("browser:paneFocused", { pane });
    });

    view.webContents.on("did-navigate", (_event, url) => {
      this.sendNavigationUpdate(url, pane);
      this.sendNavigationState(pane);
    });

    view.webContents.on("did-navigate-in-page", (_event, url) => {
      this.sendNavigationUpdate(url, pane);
      this.sendNavigationState(pane);
    });

    view.webContents.on("did-start-loading", () => {
      this.sendNavigationState(pane);
    });

    view.webContents.on("did-stop-loading", () => {
      this.sendNavigationState(pane);
    });

    view.webContents.on("did-fail-load", () => {
      this.sendNavigationState(pane);
    });

    view.webContents.on("page-title-updated", (_event, title) => {
      this.window.webContents.send("browser:titleUpdated", { pane, title });
    });

    view.webContents.on("page-favicon-updated", (_event, favicons) => {
      const faviconUrl = getFaviconUrl(favicons);
      if (faviconUrl) {
        this.window.webContents.send("browser:faviconUpdated", { pane, faviconUrl });
      }
    });

    this.window.contentView.addChildView(view);
    paneState.isAttached = true;
    paneState.view = view;
    this.sendNavigationState(pane);
    return view;
  }

  private updatePaneBounds(pane: BrowserPane, bounds: ContentBounds): void {
    const paneState = this.panes[pane];
    if (hasSameBounds(paneState.bounds, bounds)) {
      return;
    }

    paneState.bounds = bounds;
    this.applyBounds(pane);
  }

  private applyBounds(pane: BrowserPane): void {
    const paneState = this.panes[pane];
    if (!paneState.view || !paneState.isAttached) {
      return;
    }

    if (paneState.appliedBounds && hasSameBounds(paneState.appliedBounds, paneState.bounds)) {
      return;
    }

    paneState.view.setBounds(paneState.bounds);
    paneState.appliedBounds = { ...paneState.bounds };
  }

  private closePane(pane: BrowserPane): void {
    const paneState = this.panes[pane];
    if (!paneState.view) {
      return;
    }

    if (paneState.isAttached) {
      this.window.contentView.removeChildView(paneState.view);
    }

    paneState.view.webContents.close();
    paneState.view = null;
    paneState.isAttached = false;
    paneState.appliedBounds = null;
    this.sendNavigationState(pane);
  }

  private sendNavigationUpdate(url: string, pane: BrowserPane): void {
    if (isLoadableUrl(url)) {
      this.window.webContents.send("browser:didNavigate", { pane, url });
    }
  }

  private getNavigationState(pane: BrowserPane): NavigationState {
    const view = this.panes[pane].view;
    return {
      pane,
      canGoBack: Boolean(view?.webContents.navigationHistory.canGoBack()),
      canGoForward: Boolean(view?.webContents.navigationHistory.canGoForward()),
      isLoading: Boolean(view?.webContents.isLoading())
    };
  }

  private sendNavigationState(pane: BrowserPane): void {
    const navigationState = this.getNavigationState(pane);
    const lastState = this.lastNavigationStates[pane];
    if (
      lastState &&
      lastState.canGoBack === navigationState.canGoBack &&
      lastState.canGoForward === navigationState.canGoForward &&
      lastState.isLoading === navigationState.isLoading
    ) {
      return;
    }

    this.lastNavigationStates[pane] = navigationState;
    this.window.webContents.send("browser:navigationStateUpdated", navigationState);
  }
}
