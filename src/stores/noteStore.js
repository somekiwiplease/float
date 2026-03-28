// ─── Float Note Store ─────────────────────────────────────
// Simple reactive store — no external state lib needed.
// All data sanitized before save, validated on load.
// ──────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";

// ─── SECURITY CONSTANTS ──────────────────────────────────
const MAX_NOTES = 500;
const MAX_TITLE_LEN = 200;
const MAX_CONTENT_LEN = 50_000;

// ─── COLOR PALETTE (allowlist) ───────────────────────────
const COLORS = [
  { name: "pink", bg: "rgba(255, 182, 193, 0.65)", solid: "#ffb6c1" },
  { name: "lavender", bg: "rgba(200, 180, 255, 0.65)", solid: "#c8b4ff" },
  { name: "mint", bg: "rgba(170, 235, 200, 0.65)", solid: "#aaebc8" },
  { name: "peach", bg: "rgba(255, 213, 170, 0.65)", solid: "#ffd5aa" },
  { name: "sky", bg: "rgba(170, 210, 255, 0.65)", solid: "#aad2ff" },
  { name: "lemon", bg: "rgba(255, 245, 170, 0.65)", solid: "#fff5aa" },
  { name: "coral", bg: "rgba(255, 175, 160, 0.65)", solid: "#ffafa0" },
  { name: "lilac", bg: "rgba(220, 190, 255, 0.65)", solid: "#dcbeff" },
];
Object.freeze(COLORS);

const VALID_COLOR_NAMES = new Set(COLORS.map((c) => c.name));
const DEFAULT_NOTE_WIDTH = 280;
const DEFAULT_NOTE_HEIGHT = 320;

// ─── ALLOWED NOTE FIELDS (whitelist) ─────────────────────
// Only these keys are allowed on a note object.
// Prevents prototype pollution and field injection.
const ALLOWED_NOTE_FIELDS = new Set([
  "id", "title", "content", "x", "y", "width", "height",
  "color", "opacity",
  "collapsed", "minimized", "alwaysOnTop",
  "createdAt", "updatedAt",
]);

// ─── SANITIZE ────────────────────────────────────────────
function sanitizeString(val, maxLen) {
  if (typeof val !== "string") return "";
  return val.slice(0, maxLen);
}

function sanitizeNumber(val, min, max, fallback) {
  if (typeof val !== "number" || !Number.isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, val));
}

function sanitizeBoolean(val) {
  return val === true;
}

/** Basic HTML cleanup for rich note body (contenteditable); runs in browser only. */
function sanitizeRichTextContent(html) {
  if (typeof html !== "string") return "";
  const base = html.slice(0, MAX_CONTENT_LEN);
  if (typeof document === "undefined") return base;
  const div = document.createElement("div");
  div.innerHTML = base;
  div.querySelectorAll("script,iframe,object,embed,style,link").forEach((el) => el.remove());
  div.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const n = attr.name.toLowerCase();
      if (n.startsWith("on") || (n === "href" && /^\s*javascript:/i.test(attr.value))) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return div.innerHTML;
}

/** Strip a note down to only allowed fields with validated values */
function sanitizeNote(raw) {
  return {
    id: sanitizeString(raw.id, 50) || uuidv4(),
    title: sanitizeString(raw.title, MAX_TITLE_LEN),
    content: sanitizeRichTextContent(sanitizeString(raw.content, MAX_CONTENT_LEN)),
    x: sanitizeNumber(raw.x, -2000, 10000, 100),
    y: sanitizeNumber(raw.y, -2000, 10000, 80),
    width: sanitizeNumber(raw.width, 100, 4000, DEFAULT_NOTE_WIDTH),
    height: sanitizeNumber(raw.height, 60, 4000, DEFAULT_NOTE_HEIGHT),
    color: VALID_COLOR_NAMES.has(raw.color) ? raw.color : "lavender",
    opacity: sanitizeNumber(raw.opacity, 0.2, 1.0, 0.8),
    collapsed: sanitizeBoolean(raw.collapsed),
    minimized: sanitizeBoolean(raw.minimized),
    alwaysOnTop: sanitizeBoolean(raw.alwaysOnTop),
    createdAt: sanitizeString(raw.createdAt, 50) || new Date().toISOString(),
    updatedAt: sanitizeString(raw.updatedAt, 50) || new Date().toISOString(),
  };
}

/** Pixel position to place a new note centered on the available screen (works in browser and Tauri). */
function getCenteredNotePosition(width = DEFAULT_NOTE_WIDTH, height = DEFAULT_NOTE_HEIGHT) {
  if (typeof window === "undefined") {
    return { x: 100, y: 80 };
  }
  const s = window.screen;
  const availW = s?.availWidth ?? window.innerWidth;
  const availH = s?.availHeight ?? window.innerHeight;
  const left = s?.availLeft ?? 0;
  const top = s?.availTop ?? 0;
  const x = Math.round(left + (availW - width) / 2);
  const y = Math.round(top + (availH - height) / 2);
  return { x, y };
}

// ─── CREATE NOTE ─────────────────────────────────────────
function createNote(overrides = {}) {
  const colorIdx = Math.floor(Math.random() * COLORS.length);
  const base = {
    id: uuidv4(),
    title: "",
    content: "",
    ...getCenteredNotePosition(),
    width: DEFAULT_NOTE_WIDTH,
    height: DEFAULT_NOTE_HEIGHT,
    color: COLORS[colorIdx].name,
    opacity: 1.0,
    collapsed: false,
    minimized: false,
    alwaysOnTop: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // SECURITY: Only allow whitelisted fields from overrides
  const safeOverrides = {};
  for (const key of Object.keys(overrides)) {
    if (ALLOWED_NOTE_FIELDS.has(key)) {
      safeOverrides[key] = overrides[key];
    }
  }

  // Merge and sanitize
  return sanitizeNote({ ...base, ...safeOverrides });
}

// ─── PERSISTENCE ─────────────────────────────────────────
async function loadNotesFromDisk() {
  try {
    if (window.__TAURI__) {
      const { invoke } = await import("@tauri-apps/api/tauri");
      const data = await invoke("load_notes");
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      // Sanitize every note on load
      return parsed.slice(0, MAX_NOTES).map(sanitizeNote);
    }
  } catch (e) {
    console.warn("Tauri load failed, falling back to localStorage");
  }
  try {
    const data = localStorage.getItem("float-notes");
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_NOTES).map(sanitizeNote);
  } catch {
    return [];
  }
}

async function saveNotesToDisk(notes) {
  if (!Array.isArray(notes)) return;

  // Sanitize before saving
  const clean = notes.slice(0, MAX_NOTES).map(sanitizeNote);
  const json = JSON.stringify(clean);

  // Enforce max payload size (10MB)
  if (json.length > 10_000_000) {
    console.error("Notes payload too large, skipping save");
    return;
  }

  try {
    if (window.__TAURI__) {
      const { invoke } = await import("@tauri-apps/api/tauri");
      await invoke("save_notes", { notes: json });
      return;
    }
  } catch (e) {
    console.warn("Tauri save failed, falling back to localStorage");
  }
  try {
    localStorage.setItem("float-notes", json);
  } catch {
    // Storage full or unavailable
  }
}

/** Spawn one native window per note (Tauri only). */
async function openNoteWindowsForAll(notes) {
  if (!window.__TAURI__ || !Array.isArray(notes)) return;
  const { invoke } = await import("@tauri-apps/api/tauri");
  for (const n of notes) {
    await invoke("create_note_window", {
      noteId: n.id,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      minimized: !!n.minimized,
    });
  }
}

/** Append a new note, persist, open its window. */
async function createNoteOpenWindow() {
  const all = await loadNotesFromDisk();
  if (all.length >= MAX_NOTES) return null;
  const n = createNote();
  await saveNotesToDisk([...all, n]);
  if (window.__TAURI__) {
    const { invoke } = await import("@tauri-apps/api/tauri");
    await invoke("create_note_window", {
      noteId: n.id,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      minimized: false,
    });
  }
  return n;
}

async function updateSingleNoteOnDisk(noteId, partial) {
  if (typeof noteId !== "string") return false;
  const all = await loadNotesFromDisk();
  const i = all.findIndex((n) => n.id === noteId);
  if (i === -1) return false;
  const merged = sanitizeNote({
    ...all[i],
    ...partial,
    updatedAt: new Date().toISOString(),
  });
  all[i] = merged;
  await saveNotesToDisk(all);
  return true;
}

async function deleteNoteFromDisk(noteId) {
  if (typeof noteId !== "string") return;
  const all = await loadNotesFromDisk();
  await saveNotesToDisk(all.filter((n) => n.id !== noteId));
}

async function closeNativeNoteWindow(noteId) {
  if (!window.__TAURI__ || typeof noteId !== "string") return;
  try {
    const { invoke } = await import("@tauri-apps/api/tauri");
    await invoke("close_note_window", { noteId });
  } catch (e) {
    console.warn("close_note_window failed", e);
  }
}

async function focusNativeNoteWindow(noteId) {
  if (!window.__TAURI__ || typeof noteId !== "string") return;
  try {
    const { invoke } = await import("@tauri-apps/api/tauri");
    await invoke("focus_note_window", { noteId });
  } catch (e) {
    console.warn("focus_note_window failed", e);
  }
}

export {
  COLORS,
  MAX_NOTES,
  MAX_TITLE_LEN,
  MAX_CONTENT_LEN,
  createNote,
  sanitizeNote,
  loadNotesFromDisk,
  saveNotesToDisk,
  openNoteWindowsForAll,
  createNoteOpenWindow,
  updateSingleNoteOnDisk,
  deleteNoteFromDisk,
  closeNativeNoteWindow,
  focusNativeNoteWindow,
};
