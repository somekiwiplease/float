# Float

Beautiful floating sticky notes for your desktop. Glassmorphism UI, pastel colors, and thoughtful interactions.

![Float](public/float-icon.svg)

## Features

- **Glassmorphism design** — translucent notes with backdrop blur and pastel palette
- **8 pastel colors** — pink, lavender, mint, peach, sky, lemon, coral, lilac
- **Adjustable opacity** — make notes transparent to see your work behind them
- **Always-on-top** — pin individual notes above all windows
- **Checklist mode** — toggle any note into a checkbox list
- **Collapse notes** — double-click the header to shrink to a title pill
- **Shelf dock** — minimized notes live in a bottom dock, click to restore
- **Snap to edges** — notes snap when dragged near screen edges
- **Global shortcut** — `Cmd+Shift+F` (Mac) / `Ctrl+Shift+F` (Windows/Linux) to create a note instantly
- **System tray** — access Float from your menubar/taskbar
- **Local storage** — notes saved to `~/.float/notes.json`, no cloud, no account
- **Tiny footprint** — built with Tauri (~5MB), not Electron

## Install

### Download (recommended)

Go to [Releases](https://github.com/somekiwiplease/float/releases) and download the latest version for your OS:

- **macOS**: `Float_x.x.x_aarch64.dmg` (Apple Silicon) or `Float_x.x.x_x64.dmg` (Intel)
- **Windows**: `Float_x.x.x_x64-setup.exe`
- **Linux**: `Float_x.x.x_amd64.AppImage`

Double-click to install. That's it.

### Build from source

Prerequisites: [Node.js](https://nodejs.org/) (18+), [Rust](https://rustup.rs/)

```bash
git clone https://github.com/somekiwiplease/float.git
cd float
npm install
npm run tauri build
```

The compiled app will be in `src-tauri/target/release/bundle/`.

## Development

```bash
npm install
npm run tauri dev
```

This starts the Vite dev server + Tauri window with hot reload.

## Tech Stack

- **Tauri** — native desktop shell (Rust)
- **React 18** — UI framework
- **Framer Motion** — spring animations
- **Vite** — fast bundler

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Shift + F` | Create new note |
| Double-click header | Collapse/expand note |

## License

MIT — do whatever you want with it.

## Contributing

PRs welcome. If you have ideas for features, open an issue first so we can discuss.

---

Made by [Sharvari Suresh](https://somekiwiplease.com)
