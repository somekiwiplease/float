# Float — Project Context Document

> Give this file to Claude or Cursor so it understands the full app, architecture, design intent, and how to work on it.

---

## What is Float?

Float is an open-source, cross-platform desktop sticky notes app built with **Tauri + React**. It reimagines sticky notes with a glassmorphism UI, pastel color palette, and fluid spring-based interactions. Users download a native app from GitHub Releases — no terminal, no accounts, no cloud. Just double-click to install and press `Cmd+Shift+F` to create a note.

**Target audience:** Anyone who uses sticky notes but hates how ugly, cluttered, and disorganized they are on macOS/Windows.

**Design philosophy:** Simple, beautiful, fluid. Every interaction should feel physical and satisfying — spring physics on drag, smooth opacity transitions, animated dropdowns. Think of it as "what if a great product designer rebuilt sticky notes from scratch."

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop shell | **Tauri 1.x** (Rust) | ~5MB binary vs Electron's 150MB+. Native system tray, global shortcuts, file system access. |
| Frontend | **React 18** | Component-based UI, hooks for state. |
| Animations | **Framer Motion** | Spring physics for drag, resize, mount/unmount. `useMotionValue` + `useSpring` for buttery position interpolation. |
| IDs | **uuid** | Unique note identifiers. |
| Bundler | **Vite** | Fast HMR during development. |
| CI/CD | **GitHub Actions** | Auto-builds Mac (.dmg), Windows (.exe), Linux (.AppImage) on git tag push. |

---

## Project Structure

```
float/
├── index.html                    # Vite entry point
├── package.json                  # Node deps + scripts
├── vite.config.js                # Vite config (port 1420)
├── .gitignore
├── LICENSE                       # MIT
├── README.md                     # User-facing readme
├── CONTEXT.md                    # THIS FILE — dev context
│
├── public/
│   └── float-icon.svg            # App icon (gradient pastel)
│
├── src/                          # React frontend
│   ├── main.jsx                  # React root mount
│   ├── App.jsx                   # Main app — note state, CRUD, shelf logic
│   ├── styles.css                # All CSS — glassmorphism, pastels, layout
│   ├── components/
│   │   ├── StickyNote.jsx        # Individual note — drag, resize, checklist, settings
│   │   └── Shelf.jsx             # Bottom dock — minimized notes, controls
│   └── stores/
│       └── noteStore.js          # Color palette, note factory, load/save helpers
│
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml                # Rust deps (tauri, serde, dirs)
│   ├── build.rs                  # Tauri build script
│   ├── tauri.conf.json           # Window config, permissions, tray, bundle settings
│   ├── src/
│   │   └── main.rs               # System tray, global shortcut, note persistence
│   └── icons/
│       └── README.md             # Instructions to generate icons
│
└── .github/
    └── workflows/
        └── release.yml           # Auto-build on tag push → GitHub Releases
```

---

## Architecture

### Data Flow

```
User interaction
       │
       ▼
StickyNote.jsx  ─── onUpdate/onDelete/onMinimize ───▶  App.jsx (state)
       │                                                    │
       ▼                                                    ▼
framer-motion springs                              saveNotesToDisk()
(useMotionValue + useSpring)                              │
       │                                           ┌──────┴──────┐
       ▼                                           ▼              ▼
Smooth visual position               Tauri invoke()      localStorage
(springs interpolate, never teleport) (save_notes cmd)   (web fallback)
                                           │
                                           ▼
                                    ~/.float/notes.json
```

### State Management

- **No external state library.** Everything is `useState` in `App.jsx`.
- `notes` — array of all note objects
- `minimizedIds` — array of note IDs currently in the shelf
- `focusOrder` — array of note IDs sorted by last-focused (determines z-index stacking)
- Auto-save debounced at 500ms after any change

### Note Object Schema

```js
{
  id: "uuid-string",
  title: "",              // Header title (editable inline)
  content: "",            // Plain text body (textarea mode)
  x: 100,                // Position from left (pixels)
  y: 80,                 // Position from top (pixels)
  width: 260,            // Note width (pixels, min 200)
  height: 220,           // Note height (pixels, min 140)
  color: "lavender",     // One of: pink, lavender, mint, peach, sky, lemon, coral, lilac
  opacity: 0.65,         // Background opacity (0.2 – 1.0)
  isChecklist: false,     // Toggle between text and checklist mode
  checklistItems: [],     // Array of { text: "", checked: false }
  collapsed: false,       // Collapsed to header-only pill
  minimized: false,       // Hidden in shelf dock
  alwaysOnTop: false,     // Pinned above all other notes
  createdAt: "ISO",
  updatedAt: "ISO"
}
```

### Pastel Color Palette

| Name | RGBA (at 0.65 opacity) | Solid hex |
|------|----------------------|-----------|
| pink | rgba(255, 182, 193, 0.65) | #ffb6c1 |
| lavender | rgba(200, 180, 255, 0.65) | #c8b4ff |
| mint | rgba(170, 235, 200, 0.65) | #aaebc8 |
| peach | rgba(255, 213, 170, 0.65) | #ffd5aa |
| sky | rgba(170, 210, 255, 0.65) | #aad2ff |
| lemon | rgba(255, 245, 170, 0.65) | #fff5aa |
| coral | rgba(255, 175, 160, 0.65) | #ffafa0 |
| lilac | rgba(220, 190, 255, 0.65) | #dcbeff |

---

## Interaction Design — How things should FEEL

This is the most important section. Float's differentiator is interaction quality.

### Dragging
- **Header-only drag** — grab the note header bar to move. Body content (textarea, checklist) is not draggable.
- **Spring-interpolated position** — uses `useMotionValue` + `useSpring` (stiffness: 600, damping: 35, mass: 0.5). The note follows your cursor with a slight physical weight — never teleporting, always flowing.
- **During drag**: elevated shadow (0 20px 60px), z-index jumps to 10000, pointer-events disabled on children (prevents text selection while moving).
- **Snap to edges** — when within 30px of any screen edge, note snaps to 8px from that edge. This should feel magnetic, not jarring.
- **Position persisted on mouseup** — spring continues to settle, final position saved to disk.

### Resizing
- **Corner handle** (bottom-right) — visible on hover only (opacity transition).
- **Spring-animated size** — same spring physics as position (stiffness: 500, damping: 30). Resize feels elastic.
- **Min size**: 200×140px.

### Creating Notes
- **Mount animation**: scale 0.85 → 1, opacity 0 → 1, y offset 20px → 0. Spring with stiffness 500, damping 28.
- **Random pastel color** assigned on creation.
- **Random position offset** so new notes don't stack exactly on each other.

### Deleting Notes
- **Exit animation**: scale → 0.7, opacity → 0, y → -10. 200ms ease-in. Should feel like the note "pops" away.

### Collapse / Expand
- **Double-click header** to collapse to a 40px header pill.
- **Body animates** with height: auto transition and opacity fade.

### Dropdowns (Settings, Color Picker)
- **Scale + fade entrance**: scale 0.9 → 1, opacity 0 → 1, y offset -4px → 0. 150ms ease-out.
- **Color dots**: whileHover scale 1.25, whileTap scale 0.9.

### Shelf Dock
- **Mount**: slides up from y: 60 with spring (stiffness 300, damping 30, delay 0.2).
- **Minimized note pills**: spring scale 0 → 1 with width animation. Click to restore.

---

## Tauri Backend (Rust)

### System Tray Menu
- **New Note** — emits `create-new-note` event to frontend
- **Show All Notes** — emits `show-all-notes`
- **Hide All Notes** — emits `hide-all-notes`
- **Quit Float** — exits process
- **Left-click tray icon** — shows and focuses main window

### Global Shortcut
- `CmdOrCtrl+Shift+F` — creates a new note (shows window if hidden)

### Persistence
- Notes saved as JSON to `~/.float/notes.json`
- Two Tauri commands: `load_notes` (returns JSON string) and `save_notes` (writes JSON string)
- Frontend falls back to `localStorage` when Tauri APIs aren't available (for web dev preview)

### Window Configuration
- Transparent background, no native decorations (custom titlebar via CSS)
- Resizable, not fullscreen
- Not set to always-on-top globally (individual notes handle this)

---

## How to Run

### Prerequisites
- **Node.js 18+**: https://nodejs.org/
- **Rust**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `sudo apt install libgtk-3-dev libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev patchelf`
- **Windows**: Visual Studio C++ Build Tools

### Development
```bash
npm install
npm run tauri dev
```
This starts Vite dev server on port 1420 + Tauri window. Hot reload works for both React and CSS. Rust changes require restart.

### Web-only preview (no Tauri)
```bash
npm run dev
```
Opens in browser at `http://localhost:1420`. Notes save to localStorage instead of disk. No system tray or global shortcut, but all UI interactions work.

### Build native app
```bash
npm run tauri build
```
Produces platform-specific installer in `src-tauri/target/release/bundle/`:
- macOS: `.dmg` and `.app`
- Windows: `.msi` and `.exe`
- Linux: `.AppImage` and `.deb`

### Generate app icons
```bash
npm run tauri icon public/float-icon.svg
```
Generates all required icon sizes from the SVG.

### Release via GitHub
```bash
git tag v0.1.0
git push --tags
```
GitHub Actions builds installers for all platforms and creates a draft Release.

---

## Roadmap / Feature Ideas (not yet implemented)

These are features discussed but not yet built. Implement them if requested:

1. **Markdown-lite support** — bold (`**text**`), italic (`*text*`), and links in note body. Render as formatted text on blur, edit as raw on focus.
2. **Keyboard shortcuts within notes** — Cmd+B for bold, Cmd+L for new checklist item.
3. **Note grouping/tags** — categorize notes with colored tags, filter by tag.
4. **Search across all notes** — Cmd+F opens a search bar that highlights matching notes.
5. **Export** — export all notes as JSON, or individual notes as Markdown.
6. **Peel animation** — when creating a note, animate like a Post-it being peeled off a pad.
7. **Dynamic shadow** — shadow angle shifts based on note position relative to screen center.
8. **Sound effects** — subtle sounds on create, delete, drag-snap (optional toggle).
9. **Themes** — dark mode with different glass properties, high-contrast mode.
10. **Drag between monitors** — support multi-display positioning.

---

## Code Style Guidelines

- **React**: Functional components only, hooks for everything. No class components.
- **State**: Keep state in App.jsx, pass down via props. No context or external state lib unless complexity demands it.
- **Animations**: Always use framer-motion. Never use CSS transitions for interactive motion (drag, resize). CSS transitions are fine for hover states and static transitions.
- **CSS**: Single styles.css file. BEM-ish class names. CSS custom properties for colors/spacing. No CSS modules, no Tailwind, no styled-components.
- **Naming**: camelCase for JS variables, kebab-case for CSS classes, PascalCase for components.
- **Comments**: Use section dividers (`// ─── SECTION ───`) in components to separate concerns.

---

## Security Architecture

Float is built with a security-first mindset. The app runs fully offline, stores data locally, and has a minimal attack surface. Here's every layer of defense:

### 1. Tauri Allowlist (Principle of Least Privilege)

Every Tauri API is **disabled by default** (`"all": false`). Only the minimum required are enabled:

| API | Status | Reason |
|-----|--------|--------|
| `shell.open` | **DISABLED** | No need to open external URLs/files |
| `fs` | **DISABLED** | File I/O handled exclusively by Rust commands, not frontend |
| `http` | **DISABLED** | App is 100% offline — zero network access |
| `path` | **DISABLED** | System paths not exposed to frontend |
| `clipboard` | **DISABLED** | Not needed |
| `process` | **DISABLED** | Cannot spawn processes |
| `dialog` | **DISABLED** | No file pickers or OS dialogs |
| `notification` | **DISABLED** | Not used |
| `protocol.asset` | **DISABLED** | No asset protocol access |
| `window.show/hide/setFocus/close` | Enabled | Minimum window controls |
| `globalShortcut` | Enabled | For Cmd+Shift+F hotkey |

**What this means:** The frontend JavaScript has NO access to the filesystem, network, shell, clipboard, or any OS APIs. It can only call the two Rust commands (`load_notes`, `save_notes`) and control window visibility.

### 2. Content Security Policy (CSP)

Strict CSP in `tauri.conf.json`:

```
default-src 'self';
script-src 'self';                    — No inline scripts, no eval, no external JS
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self' ipc: tauri:;       — Only Tauri IPC, no external network
object-src 'none';                     — No plugins/embeds
base-uri 'self';                       — Prevents base tag injection
form-action 'none';                    — No form submissions
frame-ancestors 'none';                — Cannot be iframed
```

`freezePrototype: true` is enabled — prevents prototype pollution attacks on `Object`, `Array`, etc.

### 3. Rust Backend Validation

Every piece of data that enters or leaves the Rust backend is validated:

**Input validation on `save_notes`:**
- Payload size check BEFORE parsing (max 10MB)
- JSON structure validated via strict serde `#[serde(deny_unknown_fields)]`
- Note count limit: max 500 notes
- Duplicate ID detection
- Per-note field validation:
  - ID: max 50 chars, alphanumeric + hyphens only
  - Title: max 200 chars
  - Content: max 50,000 chars per note
  - Color: must be one of 8 allowed values (allowlist)
  - Opacity: clamped 0.2–1.0, NaN/Infinity rejected
  - Width/Height: clamped 100–4000px
  - X/Y: clamped -2000 to 10000
  - Checklist items: max 100 per note
  - Timestamps: max 50 chars

**Output validation on `load_notes`:**
- File size checked before reading (max 10MB)
- JSON parsed and re-validated through same pipeline
- Re-serialized from typed structs (strips any unexpected fields)

### 4. Atomic File Writes

Notes are saved using an atomic write pattern:
1. Write to `notes.json.tmp`
2. `fsync` to ensure data hits disk
3. `rename` tmp → `notes.json` (atomic on all OS)

This prevents data corruption if the app crashes mid-write.

### 5. File Permissions (Unix)

- `~/.float/` directory: `700` (owner read/write/execute only)
- `~/.float/notes.json`: `600` (owner read/write only)

Other users on the machine cannot read your notes.

### 6. Path Traversal Protection

The data path is hardcoded to `~/.float/notes.json`. The Rust backend:
- Resolves canonical paths and verifies the target is inside `~/.float/`
- Rejects any request where the resolved path escapes the data directory

### 7. Frontend Sanitization

**Field allowlisting:** Both `createNote()` and `handleUpdateNote()` use explicit allowlists of permitted field names. Unknown fields are silently dropped. This prevents:
- Prototype pollution via `__proto__` injection
- Arbitrary field injection
- State corruption

**Type enforcement:** Every note field is sanitized:
- Strings: type-checked and truncated to max length
- Numbers: type-checked, NaN/Infinity rejected, clamped to range
- Booleans: strict `=== true` check
- Arrays: type-checked, length-limited, items recursively sanitized
- Colors: must match allowlist

**Double sanitization:** Notes are sanitized on create, on update, on load from disk, and on save to disk.

### 8. No Network Access

Float makes **zero network requests**. It has no analytics, no telemetry, no update checker, no external API calls. The Tauri `http` API is disabled. The CSP blocks all external `connect-src`. The app works completely offline.

### 9. Production Hardening

- DevTools disabled in release builds (`#[cfg(not(debug_assertions))]`)
- File drop disabled on the window (`fileDropEnabled: false`)
- Navigation to external URLs blocked in `on_page_load` handler
- `withGlobalTauri: false` — Tauri APIs not exposed on `window.__TAURI__` in production
- Graceful shutdown via `app.exit(0)` instead of `std::process::exit(0)`

### 10. What Float Does NOT Do (by design)

- No cloud sync — data never leaves the machine
- No user accounts — nothing to breach
- No auto-updates — users download releases manually from GitHub
- No telemetry or analytics — no data collection whatsoever
- No third-party services — no APIs, no CDNs in production (fonts are for dev only)
- No eval, no dynamic code execution
- No browser storage in production (localStorage is dev fallback only)
- No file uploads or downloads

### Security Checklist for Contributors

When adding new features, verify:
- [ ] No new Tauri API permissions added unless absolutely necessary
- [ ] All user input validated in both Rust and React
- [ ] New note fields added to `ALLOWED_NOTE_FIELDS`, `ALLOWED_UPDATE_FIELDS`, and Rust `Note` struct
- [ ] No `innerHTML`, `dangerouslySetInnerHTML`, or `eval()` anywhere
- [ ] No external network requests
- [ ] No new `npm` dependencies without reviewing for supply chain risk
- [ ] CSP not weakened

---

## Common Tasks for AI Assistants

### "Add a new feature to notes"
1. Add the field to the Rust `Note` struct in `main.rs` (with `#[serde]` attributes)
2. Add validation for the new field in `validate_note()` in `main.rs`
3. Add the field to `ALLOWED_NOTE_FIELDS` in `noteStore.js`
4. Add the field to `ALLOWED_UPDATE_FIELDS` in `App.jsx` (if it's updatable)
5. Add sanitization in `sanitizeNote()` in `noteStore.js`
6. Add the field to `createNote()` defaults in `noteStore.js`
7. Add UI in `StickyNote.jsx`
8. If it needs a setting, add to the settings dropdown

### "Change the color palette"
1. Edit the `COLORS` array in `noteStore.js`
2. Update matching CSS variables in `styles.css`

### "Add a new animation"
1. Use framer-motion's `motion.div` with `initial`, `animate`, `exit` props
2. For interactive motion (drag, resize), use `useMotionValue` + `useSpring`
3. Wrap in `<AnimatePresence>` if the element mounts/unmounts

### "Add a new Tauri command"
1. Add `#[tauri::command] fn my_command()` in `main.rs`
2. Register in `tauri::generate_handler![..., my_command]`
3. Call from React: `import { invoke } from "@tauri-apps/api/tauri"; await invoke("my_command", { args })`

### "Fix dragging issues"
- Drag uses manual mousedown/mousemove/mouseup on `window`
- Position flows through `useMotionValue` → `useSpring` → `style.left/top`
- Position is only persisted to state on mouseup (not during drag)
- During drag, `pointer-events: none` on children prevents text selection

---

## Design Tokens Quick Reference

```
Border radius:     14px (notes), 8px (small elements), 6px (buttons)
Glass blur:        20px (notes), 24px (shelf), 10px (pills)
Glass border:      rgba(255, 255, 255, 0.3)
Shadow:            0 8px 32px rgba(0, 0, 0, 0.08)
Shadow hover:      0 12px 40px rgba(0, 0, 0, 0.12)
Shadow dragging:   0 20px 60px rgba(0, 0, 0, 0.15)
Text primary:      #2d2d3a
Text secondary:    #6b6b80
Font:              Inter, system-ui
Font sizes:        13px body, 12px labels, 11px pills, 10px captions
Note min size:     200 × 140px
Note default size: 260 × 220px
Header height:     40px
Snap threshold:    30px from edge
Edge padding:      8px
```

---

*Last updated: March 2026*
*Author: Sharvari Suresh (somekiwiplease.com)*
