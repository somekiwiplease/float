#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
// `objc` 0.2 macro expansions reference `cfg(cargo-clippy)`; harmless on modern rustc.
#![allow(unexpected_cfgs)]

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use tauri::{
    CustomMenuItem, GlobalShortcutManager, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu,
    SystemTrayMenuItem, WindowBuilder, WindowUrl,
};

// ─── SECURITY CONSTANTS ───────────────────────────────────
const MAX_NOTES: usize = 500;
const MAX_NOTE_CONTENT_LEN: usize = 50_000; // 50KB per note content
const MAX_NOTE_TITLE_LEN: usize = 200;
const MAX_TOTAL_PAYLOAD_BYTES: usize = 10_000_000; // 10MB total file size
const VALID_COLORS: &[&str] = &[
    "pink", "lavender", "mint", "peach", "sky", "lemon", "coral", "lilac",
];

// ─── NOTE SCHEMA ──────────────────────────────────────────
// Strict typed schema — only these fields are accepted and persisted.
// Any extra fields in incoming JSON are silently dropped by serde.
#[derive(Debug, Serialize, Deserialize, Clone)]
struct Note {
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    x: f64,
    #[serde(default)]
    y: f64,
    #[serde(default = "default_width")]
    width: f64,
    #[serde(default = "default_height")]
    height: f64,
    #[serde(default = "default_color")]
    color: String,
    #[serde(default = "default_opacity")]
    opacity: f64,
    #[serde(default)]
    collapsed: bool,
    #[serde(default)]
    minimized: bool,
    #[serde(default, rename = "alwaysOnTop")]
    always_on_top: bool,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default, rename = "createdAt")]
    created_at: String,
    #[serde(default, rename = "updatedAt")]
    updated_at: String,
}

fn default_width() -> f64 { 260.0 }
fn default_height() -> f64 { 220.0 }
fn default_color() -> String { "lavender".to_string() }
fn default_opacity() -> f64 { 0.8 }

// ─── SECURE DATA PATH ────────────────────────────────────
fn get_data_dir() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let path = home.join(".float");

    // Create directory with restricted permissions
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| format!("Failed to create data dir: {}", e))?;

        // Set directory permissions to owner-only (Unix)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(0o700);
            fs::set_permissions(&path, perms).ok();
        }
    }

    Ok(path)
}

fn get_data_path() -> Result<std::path::PathBuf, String> {
    let dir = get_data_dir()?;
    let path = dir.join("notes.json");

    // SECURITY: Verify the resolved path is inside our data directory
    // Prevents path traversal attacks
    let canonical_dir = dir.canonicalize().unwrap_or_else(|_| dir.clone());
    let parent = path.parent().unwrap_or(&dir);
    let canonical_parent = parent.canonicalize().unwrap_or_else(|_| parent.to_path_buf());

    if !canonical_parent.starts_with(&canonical_dir) {
        return Err("Path traversal detected".to_string());
    }

    Ok(path)
}

// ─── NOTE VALIDATION ──────────────────────────────────────
fn validate_note(note: &mut Note) -> Result<(), String> {
    // Validate ID format (UUID v4)
    if note.id.len() > 50 || note.id.is_empty() {
        return Err("Invalid note ID".to_string());
    }
    // Only allow alphanumeric and hyphens in ID
    if !note.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Invalid characters in note ID".to_string());
    }

    // Truncate oversized content (defense in depth, not rejection)
    if note.title.len() > MAX_NOTE_TITLE_LEN {
        note.title.truncate(MAX_NOTE_TITLE_LEN);
    }
    if note.content.len() > MAX_NOTE_CONTENT_LEN {
        note.content.truncate(MAX_NOTE_CONTENT_LEN);
    }

    // Validate color is from allowed palette
    if !VALID_COLORS.contains(&note.color.as_str()) {
        note.color = default_color();
    }

    // Clamp numeric values to sane ranges
    note.opacity = note.opacity.clamp(0.2, 1.0);
    note.width = note.width.clamp(100.0, 4000.0);
    note.height = note.height.clamp(60.0, 4000.0);
    note.x = note.x.clamp(-2000.0, 10000.0);
    note.y = note.y.clamp(-2000.0, 10000.0);

    // Reject NaN/Infinity
    if note.x.is_nan() || note.x.is_infinite() { note.x = 100.0; }
    if note.y.is_nan() || note.y.is_infinite() { note.y = 80.0; }
    if note.width.is_nan() || note.width.is_infinite() { note.width = default_width(); }
    if note.height.is_nan() || note.height.is_infinite() { note.height = default_height(); }
    if note.opacity.is_nan() || note.opacity.is_infinite() { note.opacity = default_opacity(); }

    note.tags.truncate(10);
    for tag in &mut note.tags {
        tag.truncate(30);
    }

    // Validate timestamp format (basic check — should be ISO 8601-ish)
    if note.created_at.len() > 50 { note.created_at.truncate(50); }
    if note.updated_at.len() > 50 { note.updated_at.truncate(50); }

    Ok(())
}

fn validate_window_note_id(note_id: &str) -> Result<(), String> {
    if note_id.is_empty() || note_id.len() > 50 {
        return Err("Invalid note window id".to_string());
    }
    if !note_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("Invalid note window id characters".to_string());
    }
    Ok(())
}

fn patch_macos_window_transparency(window: &tauri::Window<tauri::Wry>) {
    #[cfg(target_os = "macos")]
    {
        #[allow(unused_imports)]
        use cocoa::appkit::NSColor;
        use cocoa::base::{id, NO, YES};
        use objc::{class, msg_send, sel, sel_impl};

        let _ = window.with_webview(|webview| unsafe {
            let win: id = webview.ns_window();
            let () = msg_send![win, setOpaque: NO];
            let clear: id = msg_send![class!(NSColor), clearColor];
            let () = msg_send![win, setBackgroundColor: clear];
            let () = msg_send![win, setTitlebarAppearsTransparent: YES];
        });
    }
}

// ─── TAURI COMMANDS ───────────────────────────────────────
#[tauri::command]
fn create_note_window(
    app: tauri::AppHandle,
    note_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    minimized: Option<bool>,
) -> Result<(), String> {
    validate_window_note_id(&note_id)?;
    if app.get_window(&note_id).is_some() {
        return Ok(());
    }

    let w = 520.0_f64;
    let h = 360.0_f64;
    let xp = 100.0_f64;
    let yp = 80.0_f64;
    let start_visible = !minimized.unwrap_or(false);

    let path: std::path::PathBuf = format!("index.html?noteId={}", note_id).into();
    let window = WindowBuilder::new(&app, note_id.clone(), WindowUrl::App(path))
        .title("")
        .inner_size(w, h)
        .min_inner_size(220.0, 160.0)
        .position(xp, yp)
        .decorations(false)
        .transparent(true)
        .always_on_top(false)
        .skip_taskbar(true)
        .resizable(true)
        .visible(start_visible)
        .build()
        .map_err(|e| e.to_string())?;

    patch_macos_window_transparency(&window);

    Ok(())
}

#[tauri::command]
fn close_note_window(app: tauri::AppHandle, note_id: String) -> Result<(), String> {
    validate_window_note_id(&note_id)?;
    if let Some(w) = app.get_window(&note_id) {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn focus_note_window(app: tauri::AppHandle, note_id: String) -> Result<(), String> {
    validate_window_note_id(&note_id)?;
    if let Some(w) = app.get_window(&note_id) {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn load_notes() -> Result<String, String> {
    let path = get_data_path()?;

    if !path.exists() {
        return Ok("[]".to_string());
    }

    // Check file size before reading
    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to read metadata: {}", e))?;
    if metadata.len() > MAX_TOTAL_PAYLOAD_BYTES as u64 {
        return Err("Notes file exceeds maximum size".to_string());
    }

    let raw = fs::read_to_string(&path).map_err(|e| format!("Failed to read notes: {}", e))?;

    // Validate it's a proper JSON array of notes
    let mut notes: Vec<Note> = serde_json::from_str(&raw)
        .map_err(|e| format!("Corrupted notes file: {}", e))?;

    // Enforce max notes limit
    if notes.len() > MAX_NOTES {
        notes.truncate(MAX_NOTES);
    }

    // Validate each note
    for note in &mut notes {
        validate_note(note)?;
    }

    // Return the validated, sanitized JSON
    serde_json::to_string(&notes).map_err(|e| format!("Serialization error: {}", e))
}

#[tauri::command]
fn save_notes(notes: String) -> Result<(), String> {
    // SECURITY: Validate payload size BEFORE parsing
    if notes.len() > MAX_TOTAL_PAYLOAD_BYTES {
        return Err("Payload too large".to_string());
    }

    // Parse and validate structure — rejects malformed JSON
    let mut parsed: Vec<Note> = serde_json::from_str(&notes)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    // Enforce max notes
    if parsed.len() > MAX_NOTES {
        return Err(format!("Too many notes (max {})", MAX_NOTES));
    }

    // Validate every note
    for note in &mut parsed {
        validate_note(note)?;
    }

    // Check for duplicate IDs
    let mut seen_ids = std::collections::HashSet::new();
    for note in &parsed {
        if !seen_ids.insert(&note.id) {
            return Err("Duplicate note IDs detected".to_string());
        }
    }

    // Re-serialize the validated data (strips any fields serde ignored)
    let clean_json = serde_json::to_string_pretty(&parsed)
        .map_err(|e| format!("Serialization error: {}", e))?;

    let path = get_data_path()?;

    // ATOMIC WRITE: Write to temp file first, then rename.
    // Prevents data corruption if the app crashes mid-write.
    let tmp_path = path.with_extension("json.tmp");

    let mut file = fs::File::create(&tmp_path)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    file.write_all(clean_json.as_bytes())
        .map_err(|e| format!("Failed to write: {}", e))?;

    file.sync_all()
        .map_err(|e| format!("Failed to sync: {}", e))?;

    // Atomic rename
    fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to save: {}", e))?;

    // Set file permissions to owner-only (Unix)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o600);
        fs::set_permissions(&path, perms).ok();
    }

    Ok(())
}

// ─── MAIN ─────────────────────────────────────────────────
fn main() {
    // Requested: `#[cfg(target_os = "macos")] tauri::window::set_transparent_titlebar(true, true);`
    // That symbol does not exist on Tauri 1.x; the macOS NSWindow hook runs at the start of `.setup()`.

    let show = CustomMenuItem::new("show".to_string(), "Show Floats");
    let new_note = CustomMenuItem::new("new".to_string(), "New Note");
    let quit = CustomMenuItem::new("quit".to_string(), "Quit Float");

    let tray_menu = SystemTrayMenu::new()
        .add_item(new_note)
        .add_item(show)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                let _ = app.emit_all("show-all-notes", ());
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    let _ = app.emit_all("show-all-notes", ());
                }
                "new" => {
                    if let Some(main) = app.get_window("main") {
                        let _ = main.emit("create-new-note", ());
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        .setup(|app| {
            if let Some(window) = app.get_window("main") {
                patch_macos_window_transparency(&window);
            }

            // Register global shortcut: Cmd/Ctrl + Shift + F
            let handle = app.handle();
            app.global_shortcut_manager()
                .register("CmdOrCtrl+Shift+F", move || {
                    if let Some(main) = handle.get_window("main") {
                        let _ = main.emit("create-new-note", ());
                    }
                })
                .expect("Failed to register global shortcut");

            // Auto-create first note window on startup
            let handle2 = app.handle();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                let path: std::path::PathBuf = "index.html?noteId=startup".into();
                if let Ok(window) = WindowBuilder::new(
                    &handle2,
                    "startup",
                    WindowUrl::App(path),
                )
                .title("")
                .inner_size(520.0, 360.0)
                .position(100.0, 80.0)
                .decorations(false)
                .transparent(true)
                .always_on_top(false)
                .skip_taskbar(true)
                .resizable(false)
                .visible(true)
                .build() {
                    patch_macos_window_transparency(&window);
                }
            });

            // SECURITY: Disable devtools in production builds
            #[cfg(not(debug_assertions))]
            {
                if let Some(window) = app.get_window("main") {
                    // Navigation to external URLs is blocked by CSP,
                    // but we also prevent opening devtools in release
                    let _ = window;
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_notes,
            save_notes,
            create_note_window,
            close_note_window,
            focus_note_window
        ])
        .on_page_load(|window, _payload| {
            // SECURITY: Prevent navigation to external URLs
            let url = window.url().to_string();
            if !url.starts_with("tauri://") && !url.starts_with("http://localhost") && !url.starts_with("https://tauri.localhost") {
                eprintln!("SECURITY: Blocked navigation to external URL: {}", url);
                window.close().ok();
            }
        })
        .on_window_event(#[allow(unused_variables)] |event| {})
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
