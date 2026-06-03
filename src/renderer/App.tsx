import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CommandBar, { CommandBarItem } from "./components/CommandBar";
import Sidebar from "./components/Sidebar";
import StartPage from "./components/StartPage";
import Toolbar from "./components/Toolbar";
import { useBrowserStore, SpaceId } from "./state/browserStore";
import { getUrlDisplayValue, resolveNavigationInput } from "./utils/url";

const PINNED_URLS = {
  github: "https://github.com",
  linear: "https://linear.app"
};

export default function App() {
  const contentRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const lastContentBoundsRef = useRef<ContentBounds | null>(null);
  const lastContentRequestRef = useRef<string | null>(null);
  const lastCommandBarOpenRef = useRef(false);
  const resizeFrameRef = useRef<number | null>(null);
  const [addressValue, setAddressValue] = useState("");
  const [isCommandBarOpen, setCommandBarOpen] = useState(false);
  const {
    state,
    activeTab,
    selectSpace,
    openUrl,
    updateActiveUrl,
    updateActiveTitle,
    showStartPage
  } = useBrowserStore();

  const showReactStartPage = activeTab.isStartPage;

  const resizeContentView = useCallback(() => {
    if (resizeFrameRef.current !== null) {
      return;
    }

    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;

      const content = contentRef.current;
      if (!content) {
        return;
      }

      const rect = content.getBoundingClientRect();
      const bounds: ContentBounds = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
      const previousBounds = lastContentBoundsRef.current;

      if (
        previousBounds &&
        previousBounds.x === bounds.x &&
        previousBounds.y === bounds.y &&
        previousBounds.width === bounds.width &&
        previousBounds.height === bounds.height
      ) {
        return;
      }

      lastContentBoundsRef.current = bounds;
      void window.andromeda.resizeContentView(bounds);
    });
  }, []);

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
    if (lastContentRequestRef.current === contentRequestKey) {
      return;
    }

    lastContentRequestRef.current = contentRequestKey;

    // Navigation is keyed by active tab identity so browser-originated URL updates do not bounce back into IPC.
    if (showReactStartPage) {
      setAddressValue("");
      void window.andromeda.showStartPage();
      return;
    }

    if (activeTab.url) {
      setAddressValue(getUrlDisplayValue(activeTab.url));
      void window.andromeda.navigate(activeTab.url);
    }
  }, [activeTab.id, activeTab.url, showReactStartPage]);

  useEffect(() => {
    return window.andromeda.onDidNavigate(({ url }) => {
      setAddressValue(getUrlDisplayValue(url));
      updateActiveUrl(url);
    });
  }, [updateActiveUrl]);

  useEffect(() => {
    return window.andromeda.onTitleUpdated(({ title }) => {
      updateActiveTitle(title);
    });
  }, [updateActiveTitle]);

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
      openUrl(url);
      setAddressValue(getUrlDisplayValue(url));
    },
    [openUrl]
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

  const handleBack = useCallback(() => {
    void window.andromeda.goBack();
  }, []);

  const handleForward = useCallback(() => {
    void window.andromeda.goForward();
  }, []);

  const handleReload = useCallback(() => {
    void window.andromeda.reload();
  }, []);

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
    setCommandBarOpen(true);
  }, []);

  const closeCommandBar = useCallback(() => {
    setCommandBarOpen(false);
  }, []);

  const handleCommandInputNavigation = useCallback(
    (input: string) => {
      navigateTo(resolveNavigationInput(input));
    },
    [navigateTo]
  );

  const commandBarItems = useMemo<CommandBarItem[]>(
    () => [
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
        run: () => void window.andromeda.reload()
      },
      {
        id: "go-back",
        title: "Go Back",
        subtitle: "Navigate back",
        icon: "arrowLeft",
        keywords: ["history", "previous"],
        run: () => void window.andromeda.goBack()
      },
      {
        id: "go-forward",
        title: "Go Forward",
        subtitle: "Navigate forward",
        icon: "arrowRight",
        keywords: ["history", "next"],
        run: () => void window.andromeda.goForward()
      }
    ],
    [handleSelectSpace, handleShowStartPage, navigateTo]
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
        void window.andromeda.reload();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeCommandBar, isCommandBarOpen, openCommandBar]);

  return (
    <div className="window-frame">
      <div className="app-shell">
        <Toolbar
          addressValue={addressValue}
          inputRef={addressInputRef}
          onAddressChange={setAddressValue}
          onSubmit={handleSubmitAddress}
          onBack={handleBack}
          onForward={handleForward}
          onReload={handleReload}
          onNewTab={handleShowStartPage}
          onCloseWindow={handleCloseWindow}
          onMinimizeWindow={handleMinimizeWindow}
          onToggleMaximizeWindow={handleToggleMaximizeWindow}
        />
        <Sidebar
          spaces={state.spaces}
          selectedSpaceId={state.selectedSpaceId}
          onSelectSpace={handleSelectSpace}
          onNewTab={handleShowStartPage}
          onOpenPinned={handleOpenPinned}
        />

        <div ref={contentRef} className="content-view-host">
          {showReactStartPage ? (
            <StartPage
              onStartBrowsing={handleStartBrowsing}
              onImportChrome={handleImportChrome}
            />
          ) : null}
        </div>
        <CommandBar
          isOpen={isCommandBarOpen}
          commands={commandBarItems}
          onClose={closeCommandBar}
          onNavigateInput={handleCommandInputNavigation}
        />
      </div>
    </div>
  );
}
