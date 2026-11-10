# DLite

A lightweight desktop drawing app: as simple as Paint, with layers, pressure brushes and
Animate-style vector strokes, in a clean Material-style UI. Built with Tauri 2 + Svelte 5.

## Run

```bash
npm install
npm run dev          # browser preview at http://localhost:5173
npm run tauri dev    # desktop app (needs Rust + Tauri system deps)
npm run tauri build  # installer for your OS
npm test             # engine unit tests
```

Tauri system dependencies: https://v2.tauri.app/start/prerequisites/

## Layout

- `src/engine/` – drawing engine, no UI code (document, layers, compositor, history, brush, vector strokes, tools)
- `src/ui/` – Svelte components (top bar, tool rail, context bar, color picker, layers panel)
- `src/styles/tokens.css` – Material 3 design tokens, light and dark
- `src-tauri/` – desktop shell (native save dialog, file access)

## Shortcuts

| Key | Action |
|---|---|
| V B P E G I H Z | Select, Brush, Pencil, Eraser, Fill, Eyedropper, Hand, Zoom |
| `[` / `]` | Smaller / bigger brush |
| Space + drag, middle mouse | Pan |
| Ctrl + scroll | Zoom |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+0 / Ctrl+1 | Fit / 100% |
| Ctrl+N | New drawing (new tab) |
| Ctrl+J / Ctrl+E | Duplicate layer / merge down |
| Ctrl+A / Esc / Delete | Select all strokes / deselect / delete strokes |
| Ctrl+S / Ctrl+Shift+S | Save / Save as (.lite) |
| Ctrl+O | Open a .lite file or an image (in a new tab) |
| Ctrl+W | Close tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab (desktop app; browsers keep these keys) |
| Ctrl+Shift+E | Export PNG |
| X | Swap to previous color |
| Tab | Show/hide panels |

## Installers

Installers for Windows, macOS and Linux are on the [Releases page](../../releases).

To publish a new version: bump `version` in `src-tauri/tauri.conf.json`, then push a tag:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

GitHub Actions (`.github/workflows/release.yml`) builds every installer and attaches them to the release.
The installers are not code-signed yet, so Windows SmartScreen and macOS Gatekeeper show a warning the first time.

## One-file build

```bash
npx vite build -c vite.single.config.ts   # → dist-single/index.html, opens by double-click
```
