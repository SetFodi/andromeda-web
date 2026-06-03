import { BrowserWindow, WebContentsView } from "electron";

export type ContentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
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

export class BrowserViewManager {
  private view: WebContentsView | null = null;
  private isViewAttached = false;
  private bounds = DEFAULT_BOUNDS;
  private appliedBounds: ContentBounds | null = null;

  constructor(private readonly window: BrowserWindow) {}

  navigate(url: string): void {
    if (!isLoadableUrl(url)) {
      throw new Error("Unsupported navigation URL");
    }

    const view = this.ensureView();
    this.applyBounds();
    if (view.webContents.getURL() === url) {
      return;
    }

    void view.webContents.loadURL(url);
  }

  showStartPage(): void {
    if (!this.view) {
      return;
    }

    if (this.isViewAttached) {
      this.window.contentView.removeChildView(this.view);
    }

    this.view.webContents.close();
    this.view = null;
    this.isViewAttached = false;
    this.appliedBounds = null;
  }

  resize(bounds: ContentBounds): void {
    if (hasSameBounds(this.bounds, bounds)) {
      return;
    }

    this.bounds = bounds;
    this.applyBounds();
  }

  goBack(): void {
    if (this.view?.webContents.navigationHistory.canGoBack()) {
      this.view.webContents.navigationHistory.goBack();
    }
  }

  goForward(): void {
    if (this.view?.webContents.navigationHistory.canGoForward()) {
      this.view.webContents.navigationHistory.goForward();
    }
  }

  reload(): void {
    this.view?.webContents.reload();
  }

  setCommandBarOpen(isOpen: boolean): void {
    if (!this.view) {
      return;
    }

    if (isOpen && this.isViewAttached) {
      this.window.contentView.removeChildView(this.view);
      this.isViewAttached = false;
      return;
    }

    if (!isOpen && !this.isViewAttached) {
      this.window.contentView.addChildView(this.view);
      this.isViewAttached = true;
      this.applyBounds();
    }
  }

  private ensureView(): WebContentsView {
    if (this.view) {
      if (!this.isViewAttached) {
        this.window.contentView.addChildView(this.view);
        this.isViewAttached = true;
        this.applyBounds();
      }

      return this.view;
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
        this.navigate(url);
      }

      return { action: "deny" };
    });

    view.webContents.on("before-input-event", (event, input) => {
      if (!input.meta) {
        return;
      }

      const key = input.key.toLowerCase();
      if (key === "k" || key === "t") {
        event.preventDefault();
        this.window.webContents.send("browser:openCommandBar");
      }
    });

    view.webContents.on("did-navigate", (_event, url) => {
      this.sendNavigationUpdate(url);
    });

    view.webContents.on("did-navigate-in-page", (_event, url) => {
      this.sendNavigationUpdate(url);
    });

    view.webContents.on("page-title-updated", (_event, title) => {
      this.window.webContents.send("browser:titleUpdated", { title });
    });

    this.window.contentView.addChildView(view);
    this.isViewAttached = true;
    this.view = view;
    return view;
  }

  private applyBounds(): void {
    if (!this.view || !this.isViewAttached) {
      return;
    }

    if (this.appliedBounds && hasSameBounds(this.appliedBounds, this.bounds)) {
      return;
    }

    this.view.setBounds(this.bounds);
    this.appliedBounds = { ...this.bounds };
  }

  private sendNavigationUpdate(url: string): void {
    if (isLoadableUrl(url)) {
      this.window.webContents.send("browser:didNavigate", { url });
    }
  }
}
