# Float

> Beautiful, lightweight sticky notes for your desktop. Pastel colors, rich text, and a tiny footprint.

---

## What is Float?

Float is an open-source desktop sticky notes app built with **Tauri + React**. Each note lives as its own native window — just like macOS Stickies — so your desktop stays fully clickable underneath. Notes are saved locally to your machine. No cloud, no account, no tracking.

---

## Features

- **Pastel colors** — 8 colors: pink, lavender, mint, peach, sky, lemon, coral, lilac
- **Rich text editor** — Bold, Italic, Underline, Strikethrough, H1/H2/H3 headings, bullet lists
- **To-do items** — Inline checkboxes that live inside your note content
- **Collapse to header** — Shrink any note to just its title bar
- **Full screen** — Expand a note to fill your screen
- **All Floats panel** — Home icon opens a searchable list of all your notes
- **Global shortcut** — `Cmd+Shift+F` (Mac) / `Ctrl+Shift+F` (Windows/Linux) to create a new note instantly
- **System tray** — Float lives in your menubar/taskbar, always one click away
- **Local storage** — Notes saved to `~/.float/notes.json`, never leaves your machine
- **Tiny footprint** — Built with Tauri (~5MB), not Electron

---

## Screenshots

> Coming soon

---

## Install

### Download (recommended)

Go to [Releases](https://github.com/somekiwiplease/float/releases) and download the latest version for your OS:

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `Float_x.x.x_aarch64.dmg` |
| macOS (Intel) | `Float_x.x.x_x64.dmg` |
| Windows | `Float_x.x.x_x64-setup.exe` |
| Linux | `Float_x.x.x_amd64.AppImage` |

Double-click to install. That's it.

---

## Run from Source

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable)
- On macOS: Xcode Command Line Tools (`xcode-select --install`)
- On Windows: [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- On Linux: `webkit2gtk`, `libayatana-appindicator3` (see [Tauri prereqs](https://tauri.app/v1/guides/getting-started/prerequisites))

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/somekiwiplease/float.git
cd float

# 2. Install JS dependencies
npm install

# 3. Start in development mode (hot reload)
npm run tauri dev
```

The app will launch with a note window. Changes to React files reload instantly. Changes to Rust files trigger a recompile.

### Build for production

```bash
npm run tauri build
```

The compiled app will be in `src-tauri/target/release/bundle/`.

---

## Project Structure

```
float/
├── src/                        # React frontend
│   ├── main.jsx                # React entry point
│   ├── App.jsx                 # App root — manager + single note mode
│   ├── styles.css              # All styles
│   └── components/
│       └── StickyNote.jsx      # Note UI — header, toolbar, editor
│   └── stores/
│       └── noteStore.js        # Note factory, sanitization, persistence
│
├── src-tauri/                  # Rust backend
│   ├── src/main.rs             # Tray, shortcuts, window management, file I/O
│   ├── tauri.conf.json         # Window config, permissions, bundle settings
│   └── Cargo.toml              # Rust dependencies
│
├── public/
│   └── float-icon.svg          # App icon
│
└── .github/
    └── workflows/
        └── release.yml         # Auto-builds on git tag push
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Shift + F` | Create new note |
| `Cmd/Ctrl + B` | Bold |
| `Cmd/Ctrl + I` | Italic |
| `Cmd/Ctrl + U` | Underline |

---

## How It Works

Each Float note is its own **native Tauri window** — transparent, frameless, and independent. A hidden manager window handles the system tray and global shortcut, spawning note windows as needed.

Notes are saved as JSON to `~/.float/notes.json` using atomic writes (write to temp → fsync → rename) to prevent corruption. All data is validated in both Rust and React before saving.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 1.x (Rust) |
| Frontend | React 18 |
| Animations | Framer Motion |
| Bundler | Vite |
| CI/CD | GitHub Actions |

---

## Security

- Zero network access — fully offline, no telemetry
- Notes validated in both Rust and React before saving
- Strict Content Security Policy
- File permissions set to owner-only on Unix (`600`)
- Atomic file writes prevent data corruption
- No `eval`, no `innerHTML`, no external scripts

---

## Contributing

PRs welcome. If you have ideas for features, open an issue first so we can discuss.

When adding new features:
- Add new note fields to both the Rust `Note` struct and `noteStore.js`
- Validate all user input in both Rust and React
- Don't add new Tauri API permissions unless absolutely necessary

---

## License

MIT — do whatever you want with it.

---

Made by [Sharvari Suresh](https://somekiwiplease.com)
