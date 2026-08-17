# AGENTS.md

## What This Is

Electron desktop app that aggregates AI chat websites (Kimi, Gemini, DeepSeek, ChatGPT, etc.) in a single tabbed window. Chinese UI. Vanilla JS, no framework.

## Architecture

```
src/
  main/main.js       — Electron main process (single-instance lock, window state, IPC)
  preload/preload.js  — contextBridge exposing electronAPI
  renderer/           — index.html + renderer.js + styles.css (no build step)
appsettings.json      — site list (title, url, isShow); user-editable via in-app settings dialog
```

- User config is stored in `userData/appsettings.json`. On first launch, the bundled `appsettings.json` (project root) is copied there as defaults. The bundled copy is the source of truth shipped in builds.

## Commands

```bash
pnpm install          # install deps (pnpm required, not npm)
pnpm start            # run dev (electron .)
pnpm build:win        # build Windows installer (NSIS)
pnpm build:win:dir    # build unpacked directory
pnpm build:win:portable  # portable exe
pnpm build:linux      # AppImage + deb
pnpm build:mac        # dmg + zip
```

No test suite, no linter, no type checker, no formatter configured.

## Key Gotchas

- **User-Agent spoofing** (`src/main/main.js:79-97`): Electron's UA is stripped to avoid detection by Google and similar sites. If a loaded site behaves differently in a normal browser vs this app, check this logic.
- **Single-instance lock**: second launch focuses existing window instead of opening new one.
- **Window state persistence**: size/position saved to `userData/window-state.json` on resize/close.
- **`<webview>` tag**: used for embedding (not `<iframe>`). Requires `webviewTag: true` in BrowserWindow prefs. Webviews are lazy-loaded on first tab activation.
- **pnpm workspace**: `pnpm-workspace.yaml` exists solely to allow Electron's native builds (`electron`, `electron-winstaller`). Don't add unrelated workspace packages without updating it.
- **No hot reload**: renderer changes require app restart. No devtools auto-open.
- **Frameless window**: `frame: false`. Custom title bar with drag region (`-webkit-app-region: drag`). All window controls (min/max/close/refresh) are IPC-driven.
- **Proxy**: global HTTP/SOCKS5 proxy applied to `session.defaultSession` at startup via `applyProxy()`. All `<webview>` tags inherit this proxy. Settings UI in dropdown menu. Proxy config stored in `appsettings.json` → `proxy` field (`enabled`, `mode`, `host`, `port`, `username`, `password`). Auth handled via `onAuthRequired`.

## Modifying the App

- Adding a new IPC channel: add handler in `src/main/main.js`, expose via `src/preload/preload.js`, call from `src/renderer/renderer.js`.
- Changing default sites: edit `appsettings.json` in project root. The shipped `appsettings.json` is bundled into builds (listed in `package.json` `build.files`).
- Build output goes to `dist/`.
