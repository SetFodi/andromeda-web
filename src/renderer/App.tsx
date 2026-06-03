import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import CommandBar, { CommandBarItem } from "./components/CommandBar";
import Sidebar from "./components/Sidebar";
import StartPage from "./components/StartPage";
import Toolbar from "./components/Toolbar";
import { BrowserPane, BrowserTab, useBrowserStore, SpaceId } from "./state/browserStore";
import { getUrlDisplayValue, resolveNavigationInput } from "./utils/url";

const PINNED_URLS = {
  github: "https://github.com",
  linear: "https://linear.app"
};

const SPLIT_HEADER_HEIGHT = 34;
const SPLIT_GAP = 10;
const TAB_DRAG_DATA_TYPE = "application/x-andromeda-tab";

type PinnedTarget = "github" | "linear" | "docs";

function getActivePinnedTarget(tab: BrowserTab): PinnedTarget | null {
  if (tab.isStartPage) {
    return "docs";
  }

  if (!tab.url) {
    return null;
  }

  try {
    const hostname = new URL(tab.url).hostname.replace(/^www\./, "");
    if (hostname === "github.com" || hostname.endsWith(".github.com")) {
      return "github";
    }

    if (hostname === "linear.app" || hostname.endsWith(".linear.app")) {
      return "linear";
    }
  } catch {
    return null;
  }

  return null;
}

export default function App() {
  const contentRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const lastContentLayoutKeyRef = useRef<string | null>(null);
  const lastMainRequestRef = useRef<string | null>(null);
  const lastSplitRequestRef = useRef<string | null>(null);
  const lastCommandBarOpenRef = useRef(false);
  const resizeFrameRef = useRef<number | null>(null);
  const [addressValue, setAddressValue] = useState("");
  const [isCommandBarOpen, setCommandBarOpen] = useState(false);
  const [commandBarMode, setCommandBarMode] = useState<"default" | "split">("default");
  const [draggedTab, setDraggedTab] = useState<BrowserTab | null>(null);
  const [isSplitDropTargetActive, setSplitDropTargetActive] = useState(false);
  const {
    state,
    activeTab,
    activePane,
    isSplitOpen,
    splitUrl,
    splitTitle,
    splitFaviconUrl,
    selectSpace,
    selectPane,
    openUrl,
    openMainUrl,
    openSplitUrl,
    selectTab,
    closeTab,
    closeSplitView,
    updateActiveUrl,
    updateActiveTitle,
    updateActiveFavicon,
    showStartPage
  } = useBrowserStore();

  const showReactStartPage = activeTab.isStartPage;
  const activePinnedTarget = useMemo(() => {
    if (activePane === "split") {
      return getActivePinnedTarget({
        id: "split",
        title: splitTitle,
        url: splitUrl,
        isStartPage: false,
        faviconUrl: splitFaviconUrl
      });
    }

    return getActivePinnedTarget(activeTab);
  }, [activePane, activeTab, splitFaviconUrl, splitTitle, splitUrl]);
  const currentPageIcon = activePinnedTarget ?? "search";
  const currentPageTitle = activePane === "split" ? splitTitle : activeTab.title;
  const currentPageFaviconUrl = activePane === "split" ? splitFaviconUrl : activeTab.faviconUrl;

  const getContentLayout = useCallback((splitOpen: boolean): ContentBounds | ContentLayout | null => {
    const content = contentRef.current;
    if (!content) {
      return null;
    }

    const rect = content.getBoundingClientRect();
    const mainBounds: ContentBounds = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };

    if (!splitOpen) {
      return mainBounds;
    }

    const width = Math.round(rect.width);
    const leftWidth = Math.floor((width - SPLIT_GAP) / 2);
    const rightWidth = Math.max(0, width - leftWidth - SPLIT_GAP);
    const y = Math.round(rect.y + SPLIT_HEADER_HEIGHT);
    const height = Math.max(0, Math.round(rect.height - SPLIT_HEADER_HEIGHT));

    return {
      main: {
        x: Math.round(rect.x),
        y,
        width: leftWidth,
        height
      },
      split: {
        x: Math.round(rect.x + leftWidth + SPLIT_GAP),
        y,
        width: rightWidth,
        height
      }
    };
  }, []);

  const sendContentLayout = useCallback((layout: ContentBounds | ContentLayout | null, force = false) => {
    if (!layout) {
      return;
    }

    const layoutKey = JSON.stringify(layout);
    if (!force && lastContentLayoutKeyRef.current === layoutKey) {
      return;
    }

    lastContentLayoutKeyRef.current = layoutKey;
    void window.andromeda.resizeContentView(layout);
  }, []);

  const flushContentLayout = useCallback(
    (splitOpen = isSplitOpen, force = false) => {
      sendContentLayout(getContentLayout(splitOpen), force);
    },
    [getContentLayout, isSplitOpen, sendContentLayout]
  );

  const resizeContentView = useCallback(() => {
    if (resizeFrameRef.current !== null) {
      return;
    }

    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      flushContentLayout();
    });
  }, [flushContentLayout]);

  useEffect(() => {
    resizeContentView();

    const resizeObserver = new ResizeObserver(resizeContentView);
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }

    window.addEventListener("resize", resizeContentView);

    return () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", resizeContentView);
    };
  }, [resizeContentView]);

  useEffect(() => {
    const contentRequestKey = `${activeTab.id}:${showReactStartPage ? "start" : "url"}`;
    if (lastMainRequestRef.current === contentRequestKey) {
      return;
    }

    lastMainRequestRef.current = contentRequestKey;

    // Navigation is keyed by active tab identity so browser-originated URL updates do not bounce back into IPC.
    if (showReactStartPage) {
      if (activePane === "main") {
        setAddressValue("");
      }
      void window.andromeda.showStartPage();
      return;
    }

    if (activeTab.url) {
      if (activePane === "main") {
        setAddressValue(getUrlDisplayValue(activeTab.url));
      }
      flushContentLayout();
      void window.andromeda.navigate(activeTab.url, "main");
    }
  }, [activePane, activeTab.id, activeTab.url, flushContentLayout, showReactStartPage]);

  useEffect(() => {
    if (!isSplitOpen || !splitUrl) {
      lastSplitRequestRef.current = null;
      return;
    }

    const contentRequestKey = `split:${splitUrl}`;
    if (lastSplitRequestRef.current === contentRequestKey) {
      return;
    }

    lastSplitRequestRef.current = contentRequestKey;
    void window.andromeda.navigate(splitUrl, "split");
  }, [isSplitOpen, splitUrl]);

  useEffect(() => {
    return window.andromeda.onDidNavigate(({ pane, url }) => {
      if (pane === activePane) {
        setAddressValue(getUrlDisplayValue(url));
      }
      if (pane === "split") {
        lastSplitRequestRef.current = `split:${url}`;
      }
      updateActiveUrl(url, pane);
    });
  }, [activePane, updateActiveUrl]);

  useEffect(() => {
    return window.andromeda.onTitleUpdated(({ pane, title }) => {
      updateActiveTitle(title, pane);
    });
  }, [updateActiveTitle]);

  useEffect(() => {
    return window.andromeda.onFaviconUpdated(({ pane, faviconUrl }) => {
      updateActiveFavicon(faviconUrl, pane);
    });
  }, [updateActiveFavicon]);

  useEffect(() => {
    return window.andromeda.onPaneFocused(({ pane }) => {
      selectPane(pane);
    });
  }, [selectPane]);

  useEffect(() => {
    if (activePane === "split") {
      setAddressValue(splitUrl ? getUrlDisplayValue(splitUrl) : "");
      return;
    }

    setAddressValue(showReactStartPage || !activeTab.url ? "" : getUrlDisplayValue(activeTab.url));
  }, [activePane, activeTab.url, showReactStartPage, splitUrl]);

  useEffect(() => {
    return window.andromeda.onOpenCommandBar(() => {
      setCommandBarOpen(true);
    });
  }, []);

  useEffect(() => {
    if (lastCommandBarOpenRef.current === isCommandBarOpen) {
      return;
    }

    lastCommandBarOpenRef.current = isCommandBarOpen;
    void window.andromeda.setCommandBarOpen(isCommandBarOpen);
  }, [isCommandBarOpen]);

  const navigateTo = useCallback(
    (url: string) => {
      flushContentLayout();
      openUrl(url);
      setAddressValue(getUrlDisplayValue(url));
    },
    [flushContentLayout, openUrl]
  );

  const openSplitCommandBar = useCallback(() => {
    setCommandBarMode("split");
    setCommandBarOpen(true);
  }, []);

  const navigateSplitTo = useCallback(
    (url: string) => {
      if (showReactStartPage) {
        flushContentLayout(false);
        openMainUrl(url);
        setAddressValue(getUrlDisplayValue(url));
        return undefined;
      }

      flushContentLayout(true);
      openSplitUrl(url);
      setAddressValue(getUrlDisplayValue(url));
      return undefined;
    },
    [flushContentLayout, openMainUrl, openSplitUrl, showReactStartPage]
  );

  const handleSubmitAddress = useCallback(() => {
    const url = resolveNavigationInput(addressValue);
    navigateTo(url);
  }, [addressValue, navigateTo]);

  const handleShowStartPage = useCallback(() => {
    showStartPage();
    setAddressValue("");
  }, [showStartPage]);

  const handleSelectSpace = useCallback(
    (spaceId: SpaceId) => {
      selectSpace(spaceId);
    },
    [selectSpace]
  );

  const handleSelectSidebarTab = useCallback(
    (spaceId: SpaceId, tabId: string) => {
      selectTab(spaceId, tabId);
    },
    [selectTab]
  );

  const handleCloseSidebarTab = useCallback(
    (spaceId: SpaceId, tabId: string) => {
      closeTab(spaceId, tabId);
    },
    [closeTab]
  );

  const handleBack = useCallback(() => {
    void window.andromeda.goBack(activePane);
  }, [activePane]);

  const handleForward = useCallback(() => {
    void window.andromeda.goForward(activePane);
  }, [activePane]);

  const handleReload = useCallback(() => {
    void window.andromeda.reload(activePane);
  }, [activePane]);

  const handleCloseWindow = useCallback(() => {
    void window.andromeda.closeWindow();
  }, []);

  const handleMinimizeWindow = useCallback(() => {
    void window.andromeda.minimizeWindow();
  }, []);

  const handleToggleMaximizeWindow = useCallback(() => {
    void window.andromeda.toggleMaximizeWindow();
  }, []);

  const handleStartBrowsing = useCallback(() => {
    addressInputRef.current?.focus();
    addressInputRef.current?.select();
  }, []);

  const handleImportChrome = useCallback(() => undefined, []);

  const handleSelectPane = useCallback(
    (pane: BrowserPane) => {
      selectPane(pane);
      void window.andromeda.setActivePane(pane);
    },
    [selectPane]
  );

  const handleCloseSplitView = useCallback(() => {
    flushContentLayout(false, true);
    closeSplitView();
    void window.andromeda.closeSplitView();
    lastSplitRequestRef.current = null;
    handleSelectPane("main");
  }, [closeSplitView, flushContentLayout, handleSelectPane]);

  const handleSidebarTabDragStart = useCallback(
    (event: DragEvent<HTMLElement>, tab: BrowserTab) => {
      if (!tab.url || tab.isStartPage) {
        event.preventDefault();
        return;
      }

      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(TAB_DRAG_DATA_TYPE, tab.url);
      event.dataTransfer.setData("text/uri-list", tab.url);
      event.dataTransfer.setData("text/plain", tab.title);
      setDraggedTab(tab);
      setSplitDropTargetActive(false);
      void window.andromeda.setCommandBarOpen(true);
    },
    []
  );

  const handleSidebarTabDragEnd = useCallback(() => {
    setDraggedTab(null);
    setSplitDropTargetActive(false);
    void window.andromeda.setCommandBarOpen(isCommandBarOpen);
  }, [isCommandBarOpen]);

  const handleContentDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!draggedTab?.url) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setSplitDropTargetActive(true);
    },
    [draggedTab]
  );

  const handleContentDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setSplitDropTargetActive(false);
  }, []);

  const handleContentDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!draggedTab?.url) {
        return;
      }

      event.preventDefault();
      const url = event.dataTransfer.getData(TAB_DRAG_DATA_TYPE) || draggedTab.url;
      setDraggedTab(null);
      setSplitDropTargetActive(false);
      navigateSplitTo(url);
      void window.andromeda.setCommandBarOpen(isCommandBarOpen);
    },
    [draggedTab, isCommandBarOpen, navigateSplitTo]
  );

  const handleOpenPinned = useCallback(
    (target: "github" | "linear" | "docs") => {
      if (target === "docs") {
        handleShowStartPage();
        return;
      }

      navigateTo(PINNED_URLS[target]);
    },
    [handleShowStartPage, navigateTo]
  );

  const openCommandBar = useCallback(() => {
    setCommandBarMode("default");
    setCommandBarOpen(true);
  }, []);

  const closeCommandBar = useCallback(() => {
    setCommandBarOpen(false);
    setCommandBarMode("default");
  }, []);

  const handleCommandInputNavigation = useCallback(
    (input: string, target: "active" | "split") => {
      const url = resolveNavigationInput(input);
      if (target === "split") {
        return navigateSplitTo(url);
      }

      navigateTo(url);
      return undefined;
    },
    [navigateSplitTo, navigateTo]
  );

  const commandBarItems = useMemo<CommandBarItem[]>(
    () => [
      {
        id: "open-split-view",
        title: "Open Split View",
        subtitle: showReactStartPage ? "Choose a page for the right pane" : "Open a right pane",
        icon: "square",
        keywords: ["split", "side by side", "right pane"],
        run: () => {
          openSplitCommandBar();
          return { keepOpen: true };
        }
      },
      {
        id: "open-github-split",
        title: "Open GitHub in Split View",
        subtitle: "https://github.com",
        icon: "github",
        keywords: ["github.com", "split", "right pane"],
        run: () => navigateSplitTo(PINNED_URLS.github)
      },
      {
        id: "open-linear-split",
        title: "Open Linear in Split View",
        subtitle: "https://linear.app",
        icon: "linear",
        keywords: ["linear.app", "split", "right pane"],
        run: () => navigateSplitTo(PINNED_URLS.linear)
      },
      {
        id: "search-split",
        title: "Search in Split View",
        subtitle: "Use the typed query in the right pane",
        icon: "search",
        keywords: ["search", "split", "right pane"],
        run: (query) => {
          const trimmedQuery = query.trim();
          if (!trimmedQuery) {
            openSplitCommandBar();
            return { keepOpen: true };
          }

          return navigateSplitTo(resolveNavigationInput(trimmedQuery));
        }
      },
      {
        id: "new-tab",
        title: "New Tab",
        subtitle: "Return to the Andromeda start page",
        icon: "plus",
        keywords: ["start", "home", "tab"],
        run: handleShowStartPage
      },
      {
        id: "open-github",
        title: "Open GitHub",
        subtitle: "https://github.com",
        icon: "github",
        keywords: ["github.com", "code", "repo"],
        run: () => navigateTo(PINNED_URLS.github)
      },
      {
        id: "open-linear",
        title: "Open Linear",
        subtitle: "https://linear.app",
        icon: "linear",
        keywords: ["linear.app", "issues", "work"],
        run: () => navigateTo(PINNED_URLS.linear)
      },
      {
        id: "open-docs",
        title: "Open Docs",
        subtitle: "Return to local start page",
        icon: "docs",
        keywords: ["documentation", "start page", "home"],
        run: handleShowStartPage
      },
      {
        id: "switch-dev",
        title: "Switch to Dev",
        subtitle: "Use the Dev space",
        icon: "code",
        keywords: ["space", "development"],
        run: () => handleSelectSpace("dev")
      },
      {
        id: "switch-work",
        title: "Switch to Work",
        subtitle: "Use the Work space",
        icon: "briefcase",
        keywords: ["space", "tasks"],
        run: () => handleSelectSpace("work")
      },
      {
        id: "switch-personal",
        title: "Switch to Personal",
        subtitle: "Use the Personal space",
        icon: "user",
        keywords: ["space"],
        run: () => handleSelectSpace("personal")
      },
      {
        id: "reload-page",
        title: "Reload Page",
        subtitle: "Refresh the current page",
        icon: "reload",
        keywords: ["refresh"],
        run: () => void window.andromeda.reload(activePane)
      },
      {
        id: "go-back",
        title: "Go Back",
        subtitle: "Navigate back",
        icon: "arrowLeft",
        keywords: ["history", "previous"],
        run: () => void window.andromeda.goBack(activePane)
      },
      {
        id: "go-forward",
        title: "Go Forward",
        subtitle: "Navigate forward",
        icon: "arrowRight",
        keywords: ["history", "next"],
        run: () => void window.andromeda.goForward(activePane)
      }
    ],
    [
      activePane,
      handleSelectSpace,
      handleShowStartPage,
      navigateSplitTo,
      navigateTo,
      openSplitCommandBar,
      showReactStartPage
    ]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isCommandBarOpen) {
        event.preventDefault();
        closeCommandBar();
        return;
      }

      if (!event.metaKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "k" || key === "t") {
        event.preventDefault();
        openCommandBar();
        return;
      }

      if (key === "l") {
        event.preventDefault();
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
      }

      if (key === "r") {
        event.preventDefault();
        void window.andromeda.reload(activePane);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePane, closeCommandBar, isCommandBarOpen, openCommandBar]);

  return (
    <div className="window-frame">
      <div className="app-shell">
        <Toolbar
          addressValue={addressValue}
          inputRef={addressInputRef}
          currentPageTitle={currentPageTitle}
          currentPageFaviconUrl={currentPageFaviconUrl}
          currentPageIcon={currentPageIcon}
          isStartPage={activePane === "main" && showReactStartPage}
          onAddressChange={setAddressValue}
          onSubmit={handleSubmitAddress}
          onBack={handleBack}
          onForward={handleForward}
          onReload={handleReload}
          onNewTab={handleShowStartPage}
          onOpenSplitView={openSplitCommandBar}
          onCloseWindow={handleCloseWindow}
          onMinimizeWindow={handleMinimizeWindow}
          onToggleMaximizeWindow={handleToggleMaximizeWindow}
        />
        <Sidebar
          spaces={state.spaces}
          selectedSpaceId={state.selectedSpaceId}
          activePinnedId={activePinnedTarget}
          onSelectSpace={handleSelectSpace}
          onSelectTab={handleSelectSidebarTab}
          onCloseTab={handleCloseSidebarTab}
          onTabDragStart={handleSidebarTabDragStart}
          onTabDragEnd={handleSidebarTabDragEnd}
          onNewTab={handleShowStartPage}
          onOpenPinned={handleOpenPinned}
        />

        <div
          ref={contentRef}
          className={
            isSplitDropTargetActive ? "content-view-host is-split-drop-target" : "content-view-host"
          }
          onDragOver={handleContentDragOver}
          onDragLeave={handleContentDragLeave}
          onDrop={handleContentDrop}
        >
          {draggedTab?.url ? (
            <div className="split-drop-layer" aria-hidden="true">
              <div className="split-drop-card">
                <span>Split View</span>
                <small>{draggedTab.title}</small>
              </div>
            </div>
          ) : null}
          {isSplitOpen ? (
            <div className="split-view-frame" aria-label="Split view">
              <button
                className={activePane === "main" ? "split-pane-label is-active" : "split-pane-label"}
                type="button"
                onClick={() => handleSelectPane("main")}
              >
                <span>{activeTab.title}</span>
              </button>
              <div className="split-divider" aria-hidden="true" />
              <div className="split-pane-label-wrap">
                <button
                  className={activePane === "split" ? "split-pane-label is-active" : "split-pane-label"}
                  type="button"
                  onClick={() => handleSelectPane("split")}
                >
                  <span>{splitTitle}</span>
                </button>
                <button
                  className="split-close"
                  type="button"
                  aria-label="Close split view"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCloseSplitView();
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ) : null}
          {showReactStartPage ? (
            <StartPage
              onStartBrowsing={handleStartBrowsing}
              onImportChrome={handleImportChrome}
            />
          ) : null}
        </div>
        <CommandBar
          isOpen={isCommandBarOpen}
          mode={commandBarMode}
          commands={commandBarItems}
          onClose={closeCommandBar}
          onNavigateInput={handleCommandInputNavigation}
        />
      </div>
    </div>
  );
}
