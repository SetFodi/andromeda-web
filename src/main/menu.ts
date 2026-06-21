import { app, BrowserWindow, Menu, MenuItemConstructorOptions } from "electron";

const isMac = process.platform === "darwin";

/**
 * Builds the application menu. Menu accelerators are processed at the app level,
 * so they fire even while a web page (WebContentsView) has keyboard focus — which
 * a renderer-side `keydown` listener cannot do. Each custom item forwards an action
 * to the host renderer via `browser:shortcut`, where the React app performs it.
 */
export function buildAppMenu(window: BrowserWindow): void {
  const send = (action: string) => {
    if (!window.isDestroyed()) {
      window.webContents.send("browser:shortcut", { action });
    }
  };

  const tabSelectionItems: MenuItemConstructorOptions[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    label: `Tab ${n}`,
    accelerator: `CmdOrCtrl+${n}`,
    click: () => send(`select-tab-${n}`)
  }));

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { label: "Preferences…", accelerator: "CmdOrCtrl+,", click: () => send("settings") },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" }
            ]
          } as MenuItemConstructorOptions
        ]
      : []),
    {
      label: "File",
      submenu: [
        { label: "New Tab", accelerator: "CmdOrCtrl+T", click: () => send("new-tab") },
        {
          label: "Reopen Closed Tab",
          accelerator: "CmdOrCtrl+Shift+T",
          click: () => send("reopen-tab")
        },
        { label: "New Space", accelerator: "CmdOrCtrl+Shift+N", click: () => send("new-space") },
        { type: "separator" },
        { label: "Print…", accelerator: "CmdOrCtrl+P", click: () => send("print") },
        { type: "separator" },
        { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: () => send("close-tab") },
        {
          label: "Close Window",
          accelerator: "CmdOrCtrl+Shift+W",
          click: () => {
            if (!window.isDestroyed()) {
              window.close();
            }
          }
        }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        { label: "Find in Page", accelerator: "CmdOrCtrl+F", click: () => send("find") }
      ]
    },
    {
      label: "View",
      submenu: [
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => send("reload") },
        { type: "separator" },
        { label: "Back", accelerator: "CmdOrCtrl+[", click: () => send("back") },
        { label: "Forward", accelerator: "CmdOrCtrl+]", click: () => send("forward") },
        { type: "separator" },
        { label: "Zoom In", accelerator: "CmdOrCtrl+Plus", click: () => send("zoom-in") },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => send("zoom-out") },
        { label: "Actual Size", accelerator: "CmdOrCtrl+0", click: () => send("zoom-reset") },
        { type: "separator" },
        { label: "Toggle Compact Sidebar", accelerator: "CmdOrCtrl+S", click: () => send("toggle-sidebar") },
        { label: "Toggle Split View", accelerator: "CmdOrCtrl+D", click: () => send("toggle-split") },
        { type: "separator" },
        { label: "Open Command Bar", accelerator: "CmdOrCtrl+K", click: () => send("command-bar") },
        { label: "Focus Address Bar", accelerator: "CmdOrCtrl+L", click: () => send("focus-address") },
        { type: "separator" },
        { label: "Show History", accelerator: "CmdOrCtrl+Y", click: () => send("history") },
        { label: "Add Bookmark", accelerator: "CmdOrCtrl+Shift+D", click: () => send("add-bookmark") },
        { label: "Show Bookmarks", accelerator: "CmdOrCtrl+Shift+B", click: () => send("show-bookmarks") },
        { label: "Toggle Reader Mode", accelerator: "CmdOrCtrl+Shift+R", click: () => send("reader") },
        { type: "separator" },
        { role: "toggleDevTools" }
      ]
    },
    {
      label: "Tabs",
      submenu: [
        { label: "Search Tabs", accelerator: "CmdOrCtrl+Shift+A", click: () => send("tab-switcher") },
        { type: "separator" },
        { label: "Next Tab", accelerator: "CmdOrCtrl+Shift+]", click: () => send("next-tab") },
        {
          label: "Previous Tab",
          accelerator: "CmdOrCtrl+Shift+[",
          click: () => send("previous-tab")
        },
        { type: "separator" },
        ...tabSelectionItems,
        { label: "Last Tab", accelerator: "CmdOrCtrl+9", click: () => send("select-last-tab") }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac ? ([{ type: "separator" }, { role: "front" }] as MenuItemConstructorOptions[]) : [])
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
