import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { resetBlockedCountForWebContents } from "./adblocker";
import {
  app,
  BrowserWindow,
  Menu,
  WebContentsView,
  clipboard,
  type ContextMenuParams,
  type DownloadItem,
  type MenuItemConstructorOptions,
  type Session,
  type WebContents
} from "electron";

// Injected into every web view; powers password capture and autofill.
const PAGE_PRELOAD_PATH = path.join(__dirname, "../preload/pagePreload.cjs");

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

export type LayoutMetrics = {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  splitOpen: boolean;
  splitRatio: number;
  findOpen: boolean;
  classic: boolean;
};

export type ReaderArticle = {
  title: string;
  byline: string;
  html: string;
  url: string;
};

type NavState = {
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
};

// Runs in the page context (via executeJavaScript). Heuristic article
// extraction: strip chrome/ads, score blocks by text length vs. link density,
// and serialize the winner down to a small allow-list of formatting tags with
// absolutized image/link URLs. Returns null when no readable body is found.
const READER_EXTRACTOR = `(function(){
  try {
    var clone = document.cloneNode(true);
    var junk = clone.querySelectorAll('script,style,noscript,iframe,nav,header,footer,aside,form,button,svg,video,[role=banner],[role=navigation],[aria-hidden=true],.ad,.ads,.advert,.advertisement,.sidebar,.comments,.related,.share,.social,.newsletter,.promo,.cookie,.popup');
    for (var i=0;i<junk.length;i++){ junk[i].remove(); }
    function textLen(el){ return (el.textContent||'').replace(/\\s+/g,' ').trim().length; }
    function linkDensity(el){ var t=textLen(el); if(!t) return 1; var l=0,as=el.querySelectorAll('a'); for(var j=0;j<as.length;j++){ l+=textLen(as[j]); } return l/t; }
    var nodes = clone.querySelectorAll('article, main, [role=main], div, section');
    var best=null, bestScore=0;
    for (var k=0;k<nodes.length;k++){
      var el=nodes[k], t=textLen(el);
      if (t<200) continue;
      var score = t * (1 - Math.min(linkDensity(el),0.9)) + el.querySelectorAll('p').length*28;
      var tag=el.tagName.toLowerCase();
      if (tag==='article') score*=1.5; else if (tag==='main') score*=1.25;
      if (score>bestScore){ bestScore=score; best=el; }
    }
    var container = best || clone.body;
    if (!container) return null;
    var allowed = {P:1,H1:1,H2:1,H3:1,H4:1,H5:1,H6:1,UL:1,OL:1,LI:1,BLOCKQUOTE:1,PRE:1,CODE:1,FIGURE:1,FIGCAPTION:1,IMG:1,A:1,STRONG:1,EM:1,B:1,I:1,BR:1,HR:1,SPAN:1,TABLE:1,THEAD:1,TBODY:1,TR:1,TD:1,TH:1};
    function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function abs(u){ try { return new URL(u, location.href).href; } catch(e){ return u; } }
    function clean(node){
      var out='';
      for (var n=0;n<node.childNodes.length;n++){
        var c=node.childNodes[n];
        if (c.nodeType===3){ out += esc(c.textContent); continue; }
        if (c.nodeType!==1) continue;
        var tag=c.tagName, tg=tag.toLowerCase();
        if (tag==='IMG'){ var s=c.getAttribute('src')||c.getAttribute('data-src')||''; if(s) out+='<img src="'+esc(abs(s))+'" loading="lazy">'; continue; }
        if (tag==='A'){ out += '<a href="'+esc(abs(c.getAttribute('href')||'#'))+'" target="_blank" rel="noreferrer">'+clean(c)+'</a>'; continue; }
        if (allowed[tag]){ out += '<'+tg+'>'+clean(c)+'</'+tg+'>'; }
        else { out += clean(c); }
      }
      return out;
    }
    var html = clean(container);
    if (html.replace(/<[^>]+>/g,'').replace(/\\s+/g,' ').trim().length < 140) return null;
    var ogt = document.querySelector('meta[property="og:title"]');
    var title = (ogt && ogt.getAttribute('content')) || document.title || location.hostname;
    var am = document.querySelector('meta[name="author"]');
    var byline = (am && am.getAttribute('content')) || '';
    return { title: title, byline: byline, html: html, url: location.href };
  } catch(e){ return null; }
})()`;

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A clean, branded offline/error page loaded into the web view when a main-frame
// navigation fails — replaces Chromium's raw error screen.
function buildRecoveryPageUrl(failedUrl: string, title: string, description: string): string {
  let host = failedUrl;
  try {
    host = new URL(failedUrl).hostname || failedUrl;
  } catch {
    /* keep raw */
  }
  const jsUrl = JSON.stringify(failedUrl).replace(/</g, "\\u003c");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)}</title><style>
    :root{color-scheme:dark}
    *{margin:0;box-sizing:border-box}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0f1a;color:#e8eef7;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
    .card{max-width:440px;padding:40px;text-align:center;animation:in .4s cubic-bezier(.16,1,.3,1) both}
    @keyframes in{from{opacity:0;transform:translateY(8px) scale(.99)}to{opacity:1;transform:none}}
    .glyph{width:62px;height:62px;margin:0 auto 22px;border-radius:18px;display:flex;align-items:center;justify-content:center;background:rgba(242,131,102,.14);font-size:28px}
    h1{font-size:22px;font-weight:640;letter-spacing:-.02em;margin-bottom:10px}
    p{color:#8c9bb3;font-size:14.5px;line-height:1.55}
    .host{color:#c4d0e3;font-weight:600}
    .desc{font-size:12px;color:#586981;margin-top:8px;font-family:ui-monospace,SFMono-Regular,monospace}
    .row{margin-top:28px;display:flex;gap:10px;justify-content:center}
    button{font:inherit;font-size:13.5px;font-weight:620;padding:10px 20px;border-radius:11px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#e8eef7;cursor:pointer;transition:all .15s}
    button:hover{border-color:rgba(255,255,255,.26);background:rgba(255,255,255,.04)}
    .primary{background:#f28366;border-color:#f28366;color:#241009}
    .primary:hover{filter:brightness(1.07);background:#f28366}
  </style></head><body><div class="card">
    <div class="glyph">⚡</div>
    <h1>${htmlEscape(title)}</h1>
    <p>The page at <span class="host">${htmlEscape(host)}</span> needs a quick recovery.</p>
    <p class="desc">${htmlEscape(description || "The connection failed")}</p>
    <div class="row">
      <button class="primary" id="retry">Try again</button>
      <button id="back">Go back</button>
    </div>
  </div>
  <script>
    var U=${jsUrl};
    document.getElementById('retry').onclick=function(){location.replace(U);};
    document.getElementById('back').onclick=function(){history.length>1?history.back():location.replace(U);};
  </script></body></html>`;
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

function buildErrorPageUrl(failedUrl: string, description: string): string {
  return buildRecoveryPageUrl(failedUrl, "This page didn't load", description);
}

// Mozilla Readability gives far cleaner article parsing than the heuristic
// fallback. We can't bundle it into the page, so we read its source once and
// inject it (string concatenation, not a template literal, since the source
// itself contains backticks). Returns null if the package can't be located.
let readabilityInjection: string | null | undefined;
function getReadabilityInjection(): string | null {
  if (readabilityInjection !== undefined) {
    return readabilityInjection;
  }
  const candidates = [
    path.join(__dirname, "..", "..", "node_modules", "@mozilla", "readability", "Readability.js"),
    path.join(process.cwd(), "node_modules", "@mozilla", "readability", "Readability.js")
  ];
  for (const candidate of candidates) {
    try {
      const source = readFileSync(candidate, "utf8");
      readabilityInjection =
        "(function(){" +
        source +
        ";try{" +
        "var article=new Readability(document.cloneNode(true)).parse();" +
        "if(!article||!article.content)return null;" +
        "var text=(article.textContent||'').replace(/\\s+/g,' ').trim();" +
        "if(text.length<140)return null;" +
        "return{title:article.title||document.title||'',byline:article.byline||'',html:article.content,url:location.href};" +
        "}catch(e){return null;}})()";
      return readabilityInjection;
    } catch {
      /* try next candidate */
    }
  }
  readabilityInjection = null;
  return null;
}

type MainTab = {
  view: WebContentsView;
  loadedUrl: string;
  attached: boolean;
  applied: ContentBounds | null;
  lastNav: NavState | null;
  lastActiveAt: number;
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
const DEFAULT_LAYOUT_METRICS: LayoutMetrics = {
  sidebarWidth: 286,
  sidebarCollapsed: false,
  splitOpen: false,
  splitRatio: 0.5,
  findOpen: false,
  classic: false
};
const TOOLBAR_HEIGHT = 56;
const CLASSIC_TABS_HEIGHT = 40;
const FIND_BAR_HEIGHT = 46;
const SPLIT_HEADER_HEIGHT = 34;
const SPLIT_GAP = 10;
const MIN_SPLIT_RATIO = 0.25;
const MAX_SPLIT_RATIO = 0.75;
const UNRESPONSIVE_RECOVERY_DELAY_MS = 3500;
const DEBUG_WEB_CONTENTS = process.env.ANDROMEDA_DEBUG_WEBCONTENTS === "1";
// Cap on simultaneously-resident main web views. Beyond this, the
// least-recently-active background tab's view is discarded (Chrome-style tab
// discarding) and rebuilt from its URL on next visit, so an all-day, many-tab,
// multi-space session can't grow unbounded renderer processes.
const MAX_RESIDENT_MAIN_VIEWS = 12;

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
  private readonly session: Session;
  private mainTabs = new Map<string, MainTab>();
  private mediaPlaying = new Set<string>();
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
  private fullscreenView: WebContentsView | null = null;
  private downloadSeq = 0;
  private layoutMetrics: LayoutMetrics = { ...DEFAULT_LAYOUT_METRICS };
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryTimers = new WeakMap<WebContents, ReturnType<typeof setTimeout>>();
  private disposed = false;
  private closing = false;

  constructor(private readonly window: BrowserWindow) {
    this.session = window.webContents.session;
    this.registerDownloads();
    this.window.on("resize", this.handleWindowResize);
    this.window.once("close", this.handleWindowClosing);
    this.window.once("closed", this.handleWindowClosed);
  }

  private readonly handleWindowResize = (): void => {
    this.scheduleWindowLayoutSync();
  };

  private readonly handleWindowClosing = (): void => {
    this.closing = true;
  };

  private readonly handleWindowClosed = (): void => {
    this.dispose();
  };

  private readonly downloadPaths = new Set<string>();

  private readonly handleDownload = (_event: unknown, item: DownloadItem): void => {
    if (this.disposed) {
      return;
    }

    const id = `dl-${Date.now().toString(36)}-${this.downloadSeq++}`;
    const emit = (state: string) => {
      if (this.window.isDestroyed()) {
        return;
      }
      const savePath = item.getSavePath();
      if (savePath) {
        this.downloadPaths.add(savePath);
      }
      this.sendToRenderer("browser:download", {
        id,
        filename: item.getFilename(),
        url: item.getURL(),
        savePath,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state
      });
    };

    item.on("updated", (_updateEvent, state) => emit(state));
    item.once("done", (_doneEvent, state) => emit(state));
    emit("progressing");
  };

  private registerDownloads(): void {
    this.session.on("will-download", this.handleDownload);
  }

  private unregisterDownloads(): void {
    this.session.off("will-download", this.handleDownload);
  }

  // Guards shell.openPath / showItemInFolder: only files this session actually
  // downloaded, or files still sitting in the OS Downloads folder, may be opened
  // — never an arbitrary path supplied by a (potentially compromised) renderer.
  canOpenDownloadPath(candidate: string): boolean {
    if (!candidate) {
      return false;
    }
    if (this.downloadPaths.has(candidate)) {
      return true;
    }
    try {
      const real = realpathSync(candidate);
      const downloadsDir = realpathSync(app.getPath("downloads"));
      const rel = path.relative(downloadsDir, real);
      const insideDownloads = rel.length > 0 && !rel.startsWith("..") && !path.isAbsolute(rel);
      return insideDownloads && statSync(real).isFile();
    } catch {
      return false;
    }
  }

  private debugViews(label: string): void {
    if (!DEBUG_WEB_CONTENTS) {
      return;
    }

    const attachedMain = [...this.mainTabs.values()].filter((entry) => entry.attached).length;
    console.info("[andromeda:webcontents]", label, {
      mainTabs: this.mainTabs.size,
      attachedMain,
      activeMainTabId: this.activeMainTabId,
      split: Boolean(this.split.view),
      splitAttached: this.split.attached,
      activePane: this.activePane
    });
  }

  private sendToRenderer(channel: string, payload: unknown): void {
    if (this.disposed || this.closing || this.window.isDestroyed() || this.window.webContents.isDestroyed()) {
      return;
    }

    try {
      const shell = this.window.webContents;
      shell.send(channel, payload);
    } catch (error) {
      // Renderer-frame churn during rapid navigation/quit can invalidate the
      // shell frame between the destroyed check and send(). These notifications
      // are best-effort UI state updates; dropping the stale one is safer than
      // letting Electron print noisy "WebFrameMain was disposed" errors.
      if (DEBUG_WEB_CONTENTS) {
        console.warn("[andromeda:webcontents] dropping renderer event", channel, error);
      }
    }
  }

  private removeChildView(view: WebContentsView): void {
    if (this.window.isDestroyed()) {
      return;
    }

    try {
      this.window.contentView.removeChildView(view);
    } catch (error) {
      if (DEBUG_WEB_CONTENTS) {
        console.warn("[andromeda:webcontents] removeChildView failed", error);
      }
    }
  }

  private addChildView(view: WebContentsView): boolean {
    if (this.window.isDestroyed()) {
      return false;
    }

    try {
      this.window.contentView.addChildView(view);
      return true;
    } catch (error) {
      if (DEBUG_WEB_CONTENTS) {
        console.warn("[andromeda:webcontents] addChildView failed", error);
      }
      return false;
    }
  }

  private detachMainEntry(entry: MainTab): void {
    if (!entry.attached) {
      return;
    }

    this.removeChildView(entry.view);
    entry.attached = false;
    entry.applied = null;
  }

  private closeMainEntry(tabId: string, entry: MainTab, emitAudioStopped = false): void {
    this.detachMainEntry(entry);
    this.clearRecoveryTimer(entry.view.webContents);
    if (!entry.view.webContents.isDestroyed()) {
      entry.view.webContents.close();
    }

    this.mainTabs.delete(tabId);
    this.mediaPlaying.delete(tabId);
    if (this.activeMainTabId === tabId) {
      this.activeMainTabId = null;
      this.activePane = "main";
    }

    if (emitAudioStopped) {
      this.sendToRenderer("browser:tabAudio", { tabId, audible: false });
    }
  }

  private detachSplitEntry(): void {
    if (!this.split.view || !this.split.attached) {
      return;
    }

    this.removeChildView(this.split.view);
    this.split.attached = false;
    this.split.applied = null;
  }

  private closeSplitEntry(): void {
    if (!this.split.view) {
      return;
    }

    const view = this.split.view;
    this.detachSplitEntry();
    this.clearRecoveryTimer(view.webContents);
    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }

    this.split.view = null;
    this.split.attached = false;
    this.split.applied = null;
    this.split.lastNav = null;
  }

  private dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }

    this.unregisterDownloads();
    this.window.off("resize", this.handleWindowResize);
    this.window.off("closed", this.handleWindowClosed);
    this.window.off("close", this.handleWindowClosing);

    for (const [tabId, entry] of [...this.mainTabs]) {
      this.closeMainEntry(tabId, entry);
    }
    this.closeSplitEntry();
    this.activeMainTabId = null;
    this.activePane = "main";
    this.debugViews("disposed");
  }

  // ---- Main tabs --------------------------------------------------------
  showTab(tabId: string, url: string): void {
    if (this.disposed) {
      return;
    }

    if (!isLoadableUrl(url)) {
      return;
    }

    // Pop the previous tab's playing video into a floating mini player.
    if (this.activeMainTabId && this.activeMainTabId !== tabId && this.mediaPlaying.has(this.activeMainTabId)) {
      this.requestPictureInPicture(this.activeMainTabId);
    }

    // Detach every other main view so only the target tab is ever visible.
    for (const [id, entry] of this.mainTabs) {
      if (id !== tabId) {
        this.detachMainEntry(entry);
      }
    }

    let entry = this.mainTabs.get(tabId);
    if (!entry) {
      const view = this.createMainView(tabId);
      entry = { view, loadedUrl: url, attached: false, applied: null, lastNav: null, lastActiveAt: Date.now() };
      this.mainTabs.set(tabId, entry);
      this.debugViews("created-main-view");
      void view.webContents.loadURL(url);
    } else if (entry.loadedUrl !== url) {
      entry.loadedUrl = url;
      void entry.view.webContents.loadURL(url);
    }

    this.activeMainTabId = tabId;
    entry.lastActiveAt = Date.now();
    this.activePane = "main";
    this.attachMain(tabId);
    // Returning to a tab brings its video back inline (closes its mini player).
    this.exitPictureInPicture(tabId);
    this.emitMainNavState(tabId);
    this.enforceResidentCap();
  }

  // Keep resident main views under MAX_RESIDENT_MAIN_VIEWS by discarding the
  // least-recently-active background tabs. The active tab and any tab still
  // playing audio/video are never discarded; a discarded view is rebuilt from
  // its URL the next time showTab targets it.
  private enforceResidentCap(): void {
    if (this.mainTabs.size <= MAX_RESIDENT_MAIN_VIEWS) {
      return;
    }
    const victims = [...this.mainTabs.entries()]
      .filter(([id]) => id !== this.activeMainTabId && !this.mediaPlaying.has(id))
      .sort((a, b) => a[1].lastActiveAt - b[1].lastActiveAt);
    let excess = this.mainTabs.size - MAX_RESIDENT_MAIN_VIEWS;
    for (const [id, entry] of victims) {
      if (excess <= 0) {
        break;
      }
      this.closeMainEntry(id, entry);
      excess -= 1;
    }
    this.debugViews("discarded-lru-main-views");
  }

  showStartPage(): void {
    if (this.disposed) {
      return;
    }

    if (this.activeMainTabId && this.mediaPlaying.has(this.activeMainTabId)) {
      this.requestPictureInPicture(this.activeMainTabId);
    }

    // Detach every main view (not just the tracked active one) so the React
    // start page is never left with a stray page floating over it.
    for (const [, entry] of this.mainTabs) {
      this.detachMainEntry(entry);
    }
    this.activeMainTabId = null;
    this.activePane = "main";
  }

  private requestPictureInPicture(tabId: string): void {
    const entry = this.mainTabs.get(tabId);
    if (!entry) {
      return;
    }

    const code = `(() => {
      try {
        if (!document.pictureInPictureEnabled || document.pictureInPictureElement) return;
        const videos = [...document.querySelectorAll('video')].filter(
          (v) => !v.disablePictureInPicture && v.readyState > 2 && v.videoWidth > 0
        );
        const target = videos.find((v) => !v.paused && !v.ended) || videos[0];
        if (target) target.requestPictureInPicture().catch(() => {});
      } catch (error) {}
    })();`;
    void entry.view.webContents.executeJavaScript(code, true).catch(() => {});
  }

  private exitPictureInPicture(tabId: string): void {
    const entry = this.mainTabs.get(tabId);
    if (!entry) {
      return;
    }

    const code = `try { if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {}); } catch (error) {}`;
    void entry.view.webContents.executeJavaScript(code, true).catch(() => {});
  }

  pruneTabs(validTabIds: string[]): void {
    if (this.disposed) {
      return;
    }

    const valid = new Set(validTabIds);
    for (const [id, entry] of this.mainTabs) {
      if (valid.has(id)) {
        continue;
      }

      this.closeMainEntry(id, entry);
    }
    this.debugViews("pruned-main-views");
  }

  sleepTab(tabId: string): void {
    if (this.disposed) {
      return;
    }

    const entry = this.mainTabs.get(tabId);
    if (!entry) {
      return;
    }

    this.closeMainEntry(tabId, entry, true);

    this.debugViews("slept-main-view");
  }

  private showWebContextMenu(wc: WebContents, params: ContextMenuParams): void {
    const items: MenuItemConstructorOptions[] = [];
    const openTab = (url: string) => this.sendToRenderer("browser:openTab", { url });

    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        items.push({ label: suggestion, click: () => wc.replaceMisspelling(suggestion) });
      }
      items.push(
        {
          label: "Add to Dictionary",
          click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord)
        },
        { type: "separator" }
      );
    }

    if (params.linkURL) {
      const link = params.linkURL;
      items.push(
        { label: "Open Link in New Tab", click: () => openTab(link) },
        { label: "Copy Link", click: () => clipboard.writeText(link) },
        { type: "separator" }
      );
    }

    if (params.mediaType === "image" && params.srcURL) {
      const src = params.srcURL;
      items.push(
        { label: "Open Image in New Tab", click: () => openTab(src) },
        { label: "Copy Image", click: () => wc.copyImageAt(params.x, params.y) },
        { label: "Save Image…", click: () => wc.downloadURL(src) },
        { type: "separator" }
      );
    }

    if (params.isEditable) {
      const flags = params.editFlags;
      items.push(
        { label: "Cut", enabled: flags.canCut, click: () => wc.cut() },
        { label: "Copy", enabled: flags.canCopy, click: () => wc.copy() },
        { label: "Paste", enabled: flags.canPaste, click: () => wc.paste() },
        { label: "Select All", click: () => wc.selectAll() },
        { type: "separator" }
      );
    } else if (params.selectionText && params.selectionText.trim()) {
      const selection = params.selectionText.trim();
      const short = selection.length > 26 ? `${selection.slice(0, 26)}…` : selection;
      items.push(
        { label: "Copy", click: () => wc.copy() },
        {
          label: `Search for “${short}”`,
          click: () => openTab(`https://www.google.com/search?q=${encodeURIComponent(selection)}`)
        },
        { type: "separator" }
      );
    }

    items.push(
      { label: "Back", enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      {
        label: "Forward",
        enabled: wc.navigationHistory.canGoForward(),
        click: () => wc.navigationHistory.goForward()
      },
      { label: "Reload", click: () => wc.reload() },
      { type: "separator" },
      { label: "Copy Page URL", click: () => clipboard.writeText(params.pageURL || wc.getURL()) },
      { type: "separator" },
      {
        label: "Inspect Element",
        click: () => {
          if (!wc.isDevToolsOpened()) {
            wc.openDevTools({ mode: "detach" });
          }
          wc.inspectElement(params.x, params.y);
        }
      }
    );

    Menu.buildFromTemplate(items).popup({ window: this.window });
  }

  private maybeLoadErrorPage(
    wc: WebContents,
    errorCode: number,
    errorDescription: string,
    validatedURL: string,
    isMainFrame: boolean
  ): void {
    // -3 is ERR_ABORTED (normal cancels/redirects); ignore non-main-frame and
    // non-http failures so we never replace the page spuriously.
    if (!isMainFrame || errorCode === -3 || !/^https?:/i.test(validatedURL)) {
      return;
    }
    void wc.loadURL(buildErrorPageUrl(validatedURL, errorDescription)).catch(() => {});
  }

  private clearRecoveryTimer(wc: WebContents): void {
    const timer = this.recoveryTimers.get(wc);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.recoveryTimers.delete(wc);
  }

  private loadRecoveryPage(wc: WebContents, url: string, title: string, description: string): void {
    if (wc.isDestroyed() || !isLoadableUrl(url)) {
      return;
    }

    void wc.loadURL(buildRecoveryPageUrl(url, title, description)).catch(() => {});
  }

  private registerRecoveryHandlers(
    wc: WebContents,
    getRecoverableUrl: () => string | null,
    onRecover: () => void
  ): void {
    wc.on("render-process-gone", (_event, details) => {
      this.clearRecoveryTimer(wc);
      onRecover();
      this.loadRecoveryPage(
        wc,
        getRecoverableUrl() ?? wc.getURL(),
        "This page crashed",
        `The renderer stopped unexpectedly (${details.reason}).`
      );
    });

    wc.on("unresponsive", () => {
      this.clearRecoveryTimer(wc);
      const timer = setTimeout(() => {
        this.recoveryTimers.delete(wc);
        if (wc.isDestroyed()) {
          return;
        }

        onRecover();
        this.loadRecoveryPage(
          wc,
          getRecoverableUrl() ?? wc.getURL(),
          "This page stopped responding",
          "The page froze for a few seconds, so Andromeda paused it here."
        );
      }, UNRESPONSIVE_RECOVERY_DELAY_MS);
      this.recoveryTimers.set(wc, timer);
    });

    wc.on("responsive", () => this.clearRecoveryTimer(wc));
    wc.on("destroyed", () => this.clearRecoveryTimer(wc));
  }

  // HTML fullscreen (e.g. a YouTube video) must cover the whole window — the
  // view otherwise stays carved into the content rect with the shell visible
  // around it. Expand while fullscreen, restore the normal layout on exit.
  private registerFullscreenHandlers(view: WebContentsView): void {
    const wc = view.webContents;
    wc.on("enter-html-full-screen", () => {
      this.fullscreenView = view;
      this.applyFullscreenBounds();
    });
    wc.on("leave-html-full-screen", () => {
      if (this.fullscreenView !== view) {
        return;
      }
      this.fullscreenView = null;
      for (const entry of this.mainTabs.values()) {
        entry.applied = null;
      }
      this.split.applied = null;
      if (this.activeMainTabId) {
        const entry = this.mainTabs.get(this.activeMainTabId);
        if (entry?.attached) {
          this.applyMainBounds(entry);
        }
      }
      this.applySplitBounds();
    });
    wc.on("destroyed", () => {
      if (this.fullscreenView === view) {
        this.fullscreenView = null;
      }
    });
  }

  private applyFullscreenBounds(): void {
    if (!this.fullscreenView || this.window.isDestroyed()) {
      return;
    }

    const { width, height } = this.window.getContentBounds();
    this.fullscreenView.setBounds({ x: 0, y: 0, width, height });
  }

  private createMainView(tabId: string): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: PAGE_PRELOAD_PATH,
        // Detached (inactive) tabs are throttled by Chromium — rAF pauses and
        // timers drop to ~1Hz — which is what keeps many open tabs cheap on
        // battery. Pin it on so a future default change can't regress that.
        backgroundThrottling: true,
        // Enable Chromium's built-in PDF viewer (PDFium) so PDF links open
        // inline with a real viewer instead of downloading. No security cost —
        // legacy NPAPI/Flash plugins no longer exist.
        plugins: true
      }
    });

    view.webContents.setMaxListeners(Math.max(view.webContents.getMaxListeners(), 32));

    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isLoadableUrl(url)) {
        this.sendToRenderer("browser:openTab", { url });
      }
      return { action: "deny" };
    });

    this.registerRecoveryHandlers(
      view.webContents,
      () => this.mainTabs.get(tabId)?.loadedUrl ?? view.webContents.getURL(),
      () => {
        this.mediaPlaying.delete(tabId);
        this.sendToRenderer("browser:tabAudio", { tabId, audible: false });
        this.emitMainNavState(tabId);
      }
    );
    this.registerFullscreenHandlers(view);

    view.webContents.on("context-menu", (_event, params) =>
      this.showWebContextMenu(view.webContents, params)
    );

    view.webContents.on("before-input-event", (_event, input) => {
      if (input.type === "keyDown") {
        this.activeMainTabId = tabId;
        this.activePane = "main";
      }
    });

    view.webContents.on("focus", () => {
      this.activeMainTabId = tabId;
      this.activePane = "main";
      this.sendToRenderer("browser:paneFocused", { pane: "main" });
    });

    const handleNavigation = (url: string) => {
      const entry = this.mainTabs.get(tabId);
      if (entry) {
        entry.loadedUrl = url;
      }
      if (isLoadableUrl(url)) {
        this.sendToRenderer("browser:tabNavigated", { tabId, url });
      }
      this.emitMainNavState(tabId);
    };

    view.webContents.on("did-navigate", (_event, url) => {
      resetBlockedCountForWebContents(view.webContents.id);
      handleNavigation(url);
    });
    view.webContents.on("did-navigate-in-page", (_event, url) => handleNavigation(url));
    view.webContents.on("did-start-loading", () => this.emitMainNavState(tabId));
    view.webContents.on("did-stop-loading", () => this.emitMainNavState(tabId));
    view.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        this.emitMainNavState(tabId);
        this.maybeLoadErrorPage(view.webContents, errorCode, errorDescription, validatedURL, isMainFrame);
      }
    );

    view.webContents.on("page-title-updated", (_event, title) => {
      this.sendToRenderer("browser:tabTitle", { tabId, title });
    });

    view.webContents.on("page-favicon-updated", (_event, favicons) => {
      const faviconUrl = getFaviconUrl(favicons);
      if (faviconUrl) {
        this.sendToRenderer("browser:tabFavicon", { tabId, faviconUrl });
      }
    });

    view.webContents.on("found-in-page", (_event, result) => {
      if (this.activeMainTabId === tabId) {
        this.sendToRenderer("browser:foundInPage", {
          pane: "main",
          activeMatchOrdinal: result.activeMatchOrdinal,
          matches: result.matches
        });
      }
    });

    // Report the deterministic play/paused state rather than isCurrentlyAudible(),
    // which is racy and frequently false at the moment media starts.
    view.webContents.on("media-started-playing", () => {
      this.mediaPlaying.add(tabId);
      this.sendToRenderer("browser:tabAudio", { tabId, audible: true });
    });
    view.webContents.on("media-paused", () => {
      this.mediaPlaying.delete(tabId);
      this.sendToRenderer("browser:tabAudio", { tabId, audible: false });
    });

    return view;
  }

  setTabMuted(tabId: string, muted: boolean): void {
    this.mainTabs.get(tabId)?.view.webContents.setAudioMuted(muted);
  }

  private attachMain(tabId: string): void {
    const entry = this.mainTabs.get(tabId);
    if (!entry || this.overlayOpen) {
      return;
    }

    if (!entry.attached) {
      if (!this.addChildView(entry.view)) {
        return;
      }
      entry.attached = true;
    }
    this.applyMainBounds(entry);
  }

  private applyMainBounds(entry: MainTab): void {
    if (this.fullscreenView === entry.view) {
      this.applyFullscreenBounds();
      return;
    }

    if (entry.applied && hasSameBounds(entry.applied, this.mainBounds)) {
      return;
    }

    entry.view.setBounds(this.mainBounds);
    entry.applied = { ...this.mainBounds };
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
    this.sendToRenderer("browser:tabNavState", { tabId, ...navState });
  }

  // ---- Split pane (single view) ----------------------------------------
  navigate(url: string, pane: BrowserPane = "split"): void {
    if (this.disposed) {
      return;
    }

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
    this.closeSplitEntry();
    this.activePane = "main";
    this.sendSplitNavState();
    this.debugViews("closed-split-view");
  }

  private ensureSplitView(): WebContentsView {
    if (this.split.view) {
      if (!this.split.attached && !this.overlayOpen) {
        this.split.attached = this.addChildView(this.split.view);
        this.applySplitBounds();
      }
      return this.split.view;
    }

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: PAGE_PRELOAD_PATH,
        backgroundThrottling: true,
        plugins: true
      }
    });

    view.webContents.setMaxListeners(Math.max(view.webContents.getMaxListeners(), 32));

    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isLoadableUrl(url)) {
        this.navigate(url, "split");
      }
      return { action: "deny" };
    });

    this.registerRecoveryHandlers(
      view.webContents,
      () => view.webContents.getURL(),
      () => this.sendSplitNavState()
    );
    this.registerFullscreenHandlers(view);

    view.webContents.on("context-menu", (_event, params) =>
      this.showWebContextMenu(view.webContents, params)
    );

    view.webContents.on("before-input-event", (_event, input) => {
      if (input.type === "keyDown") {
        this.activePane = "split";
      }
    });

    view.webContents.on("focus", () => {
      this.activePane = "split";
      this.sendToRenderer("browser:paneFocused", { pane: "split" });
    });

    view.webContents.on("did-navigate", (_event, url) => {
      resetBlockedCountForWebContents(view.webContents.id);
      this.sendSplitNavigation(url);
      this.sendSplitNavState();
    });
    view.webContents.on("did-navigate-in-page", (_event, url) => {
      this.sendSplitNavigation(url);
      this.sendSplitNavState();
    });
    view.webContents.on("did-start-loading", () => this.sendSplitNavState());
    view.webContents.on("did-stop-loading", () => this.sendSplitNavState());
    view.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        this.sendSplitNavState();
        this.maybeLoadErrorPage(view.webContents, errorCode, errorDescription, validatedURL, isMainFrame);
      }
    );
    view.webContents.on("page-title-updated", (_event, title) => {
      this.sendToRenderer("browser:titleUpdated", { pane: "split", title });
    });
    view.webContents.on("page-favicon-updated", (_event, favicons) => {
      const faviconUrl = getFaviconUrl(favicons);
      if (faviconUrl) {
        this.sendToRenderer("browser:faviconUpdated", { pane: "split", faviconUrl });
      }
    });
    view.webContents.on("found-in-page", (_event, result) => {
      if (this.activePane === "split") {
        this.sendToRenderer("browser:foundInPage", {
          pane: "split",
          activeMatchOrdinal: result.activeMatchOrdinal,
          matches: result.matches
        });
      }
    });

    this.split.view = view;
    this.split.attached = this.addChildView(view);
    this.sendSplitNavState();
    this.debugViews("created-split-view");
    return view;
  }

  private applySplitBounds(): void {
    if (!this.split.view || !this.split.attached) {
      return;
    }
    if (this.fullscreenView === this.split.view) {
      this.applyFullscreenBounds();
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
      this.sendToRenderer("browser:didNavigate", { pane: "split", url });
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
    this.sendToRenderer("browser:navigationStateUpdated", { pane: "split", ...navState });
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

  async extractReadable(pane: BrowserPane): Promise<ReaderArticle | null> {
    const view = this.paneView(pane);
    if (!view) {
      return null;
    }
    const wc = view.webContents;
    const run = async (code: string | null): Promise<ReaderArticle | null> => {
      if (!code) {
        return null;
      }
      try {
        const result = (await wc.executeJavaScript(code, true)) as ReaderArticle | null;
        if (
          result &&
          typeof result.html === "string" &&
          typeof result.title === "string" &&
          typeof result.url === "string"
        ) {
          return {
            title: result.title,
            byline: typeof result.byline === "string" ? result.byline : "",
            html: result.html,
            url: result.url
          };
        }
      } catch {
        /* fall through to fallback */
      }
      return null;
    };

    // Prefer Mozilla Readability; fall back to the built-in heuristic.
    return (await run(getReadabilityInjection())) ?? (await run(READER_EXTRACTOR));
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

  adjustZoom(pane: BrowserPane, direction: "in" | "out" | "reset"): number {
    const view = this.paneView(pane);
    if (!view) {
      return 0;
    }

    const webContents = view.webContents;
    if (direction === "reset") {
      webContents.setZoomLevel(0);
      return 0;
    }

    const step = direction === "in" ? 0.5 : -0.5;
    const next = Math.max(-3, Math.min(5, webContents.getZoomLevel() + step));
    webContents.setZoomLevel(next);
    return next;
  }

  getZoom(pane: BrowserPane = this.activePane): number {
    return this.paneView(pane)?.webContents.getZoomLevel() ?? 0;
  }

  print(pane: BrowserPane = this.activePane): void {
    this.paneView(pane)?.webContents.print();
  }

  getPaneWebContentsId(pane: BrowserPane = this.activePane): number | null {
    return this.paneView(pane)?.webContents.id ?? null;
  }

  // True when the given webContents belongs to one of our web views — used to
  // gate IPC channels that pages (not the shell) are allowed to call.
  hasWebContents(webContentsId: number): boolean {
    for (const entry of this.mainTabs.values()) {
      if (entry.view.webContents.id === webContentsId) {
        return true;
      }
    }
    return this.split.view?.webContents.id === webContentsId;
  }

  resize(layout: ContentLayout): void {
    this.mainBounds = layout.main;
    const activeView = this.activeMainView();
    if (activeView && !this.overlayOpen) {
      const activeEntry = this.activeMainTabId ? this.mainTabs.get(this.activeMainTabId) : null;
      if (activeEntry) {
        this.applyMainBounds(activeEntry);
      }
    }

    if (layout.split) {
      this.split.bounds = layout.split;
      this.applySplitBounds();
    }
  }

  setLayoutMetrics(metrics: Partial<LayoutMetrics>): void {
    this.layoutMetrics = {
      sidebarWidth: clampRounded(metrics.sidebarWidth ?? this.layoutMetrics.sidebarWidth, 0, 10000),
      sidebarCollapsed: metrics.sidebarCollapsed ?? this.layoutMetrics.sidebarCollapsed,
      splitOpen: metrics.splitOpen ?? this.layoutMetrics.splitOpen,
      splitRatio: clamp(
        metrics.splitRatio ?? this.layoutMetrics.splitRatio,
        MIN_SPLIT_RATIO,
        MAX_SPLIT_RATIO
      ),
      findOpen: metrics.findOpen ?? this.layoutMetrics.findOpen,
      classic: metrics.classic ?? this.layoutMetrics.classic
    };
    this.syncLayoutFromWindow();
  }

  syncLayoutFromWindow(): void {
    if (this.disposed || this.window.isDestroyed()) {
      return;
    }

    const bounds = this.window.getContentBounds();
    this.resize(this.computeLayout(bounds.width, bounds.height));
  }

  private scheduleWindowLayoutSync(): void {
    if (this.disposed || this.resizeTimer) {
      return;
    }

    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      this.syncLayoutFromWindow();
    }, 0);
  }

  private computeLayout(width: number, height: number): ContentLayout {
    const findInset = this.layoutMetrics.findOpen ? FIND_BAR_HEIGHT : 0;
    const classic = this.layoutMetrics.classic;
    const contentX = classic ? 0 : Math.round(this.layoutMetrics.sidebarCollapsed ? 8 : this.layoutMetrics.sidebarWidth);
    const contentY = classic ? TOOLBAR_HEIGHT + CLASSIC_TABS_HEIGHT : TOOLBAR_HEIGHT;
    const contentWidth = Math.max(0, Math.round(width - contentX));
    const contentHeight = Math.max(0, Math.round(height - contentY));

    if (!this.layoutMetrics.splitOpen) {
      return {
        main: {
          x: contentX,
          y: contentY + findInset,
          width: contentWidth,
          height: Math.max(0, contentHeight - findInset)
        }
      };
    }

    const leftWidth = Math.round((contentWidth - SPLIT_GAP) * this.layoutMetrics.splitRatio);
    const rightWidth = Math.max(0, contentWidth - leftWidth - SPLIT_GAP);
    const paneY = contentY + SPLIT_HEADER_HEIGHT + findInset;
    const paneHeight = Math.max(0, contentHeight - SPLIT_HEADER_HEIGHT - findInset);

    return {
      main: {
        x: contentX,
        y: paneY,
        width: leftWidth,
        height: paneHeight
      },
      split: {
        x: contentX + leftWidth + SPLIT_GAP,
        y: paneY,
        width: rightWidth,
        height: paneHeight
      }
    };
  }

  setCommandBarOpen(isOpen: boolean): void {
    if (this.disposed) {
      return;
    }

    this.overlayOpen = isOpen;

    if (isOpen) {
      for (const [, entry] of this.mainTabs) {
        this.detachMainEntry(entry);
      }
      this.detachSplitEntry();
      return;
    }

    if (this.activeMainTabId) {
      this.attachMain(this.activeMainTabId);
    }
    if (this.split.view && !this.split.attached) {
      this.split.attached = this.addChildView(this.split.view);
      this.applySplitBounds();
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function clampRounded(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}
