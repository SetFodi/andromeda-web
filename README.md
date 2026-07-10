# Andromeda

A calm, fast macOS browser. Built with Electron, React, and TypeScript.

- **Spaces** — separate worlds for work, play, and everything else, each with its own theme color
- **Shield** — ads and trackers are blocked before they load (network-level, EasyList + EasyPrivacy)
- **Reader** — any article, distilled to a clean serif page (⌘⇧R)
- Split view, tab sleeping, frecency-ranked omnibar (⌘K / ⌘T), tab search (⌘⇧A), history (⌘Y)
- Full-height sidebar, domain chip address bar, Tidy / Clear tabs, hover URL pill

**Current release:** [v0.4.0](https://github.com/SetFodi/andromeda-web/releases/latest)

Legal: [Terms of Service](./TERMS.md) · [Privacy Policy](./PRIVACY.md)

## Installing the app

Grab `Andromeda-0.4.0-arm64.dmg` from the latest release, open it, and drag Andromeda into Applications.

Andromeda is not signed with an Apple Developer certificate, so macOS will warn you
on first launch. This happens once:

- **macOS 15 (Sequoia) and newer:** open the app, dismiss the warning, then go to
  **System Settings → Privacy & Security**, scroll down, and click **Open Anyway**.
- **macOS 14 and older:** right-click the app in Applications and choose **Open**,
  then confirm.

After that it opens like any other app. (Terminal alternative that skips the
prompt entirely: `xattr -d com.apple.quarantine /Applications/Andromeda.app`)

## Development

```sh
pnpm install
pnpm dev        # vite + electron with live renderer reload
pnpm typecheck
pnpm build      # production build into dist/
pnpm start      # run the production build
pnpm dist       # build + package the DMG into release/
```

Apple Silicon only for now. To also ship an Intel build, add `"x64"` to
`build.mac.target[0].arch` in `package.json`.
