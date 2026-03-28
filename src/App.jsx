import React, { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import StickyNote from "./components/StickyNote";
import {
  createNote,
  sanitizeNote,
  loadNotesFromDisk,
  saveNotesToDisk,
  MAX_NOTES,
  openNoteWindowsForAll,
  createNoteOpenWindow,
  updateSingleNoteOnDisk,
  deleteNoteFromDisk,
  closeNativeNoteWindow,
  focusNativeNoteWindow,
} from "./stores/noteStore";

const SAVE_DEBOUNCE = 500;

const ALLOWED_UPDATE_FIELDS = new Set([
  "title", "content", "x", "y", "width", "height",
  "color", "opacity",
  "collapsed", "minimized", "alwaysOnTop", "tags", "updatedAt",
]);

function sanitizeUpdate(changes) {
  const clean = {};
  for (const key of Object.keys(changes)) {
    if (ALLOWED_UPDATE_FIELDS.has(key)) {
      clean[key] = changes[key];
    }
  }
  return clean;
}

function DeleteDialog({ noteName, onConfirm, onCancel }) {
  return (
    <motion.div
      className="delete-dialog-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onCancel}
    >
      <motion.div
        className="delete-dialog"
        initial={{ scale: 0.9, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 8 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="delete-dialog-text">
          Delete <strong>"{noteName}"</strong>?
        </p>
        <div className="delete-dialog-actions">
          <button className="delete-dialog-btn cancel" onClick={onCancel}>Cancel</button>
          <button className="delete-dialog-btn confirm" onClick={onConfirm}>Delete</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Hidden manager: spawns one window per note, tray / shortcut only ───
function ManagerApp() {
  useEffect(() => {
    let unlistenCreate;
    (async () => {
      try {
        let list = await loadNotesFromDisk();
        console.log("Loaded notes:", list);
        if (!list.length) {
          const first = createNote();
          list = [first];
          await saveNotesToDisk(list);
          console.log("Created first note:", first);
        }
        await openNoteWindowsForAll(list);
        console.log("Opened windows for all notes");
        const { listen } = await import("@tauri-apps/api/event");
        unlistenCreate = await listen("create-new-note", () => {
          createNoteOpenWindow();
        });
      } catch (err) {
        console.error("ManagerApp error:", err);
      }
    })();
    return () => { unlistenCreate?.(); };
  }, []);

  return <div className="app-canvas manager-root" aria-hidden="true" />;
}

// ─── One native window = one note ───
function SingleNoteApp({ noteId }) {
  const [note, setNote] = useState(null);
  const [allNotes, setAllNotes] = useState([]);
  const [deleteDialog, setDeleteDialog] = useState(null);

  const refreshAllNotes = useCallback(async () => {
    const list = await loadNotesFromDisk();
    setAllNotes(list);
  }, []);

  useEffect(() => {
    (async () => {
      const list = await loadNotesFromDisk();
      setAllNotes(list);
      const n = list.find((x) => x.id === noteId);
      setNote(n || null);
    })();
  }, [noteId]);

  useEffect(() => {
    if (!window.__TAURI__) return undefined;
    let unlistenShow;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const { appWindow } = await import("@tauri-apps/api/window");
      unlistenShow = await listen("show-all-notes", async () => {
        await appWindow.show();
        const list = await loadNotesFromDisk();
        const n = list.find((x) => x.id === noteId);
        if (n) setNote(n);
        setAllNotes(list);
      });
    })();
    return () => {
      unlistenShow?.();
    };
  }, [noteId]);

  useEffect(() => {
    if (!note || !window.__TAURI__) return;
    (async () => {
      const { appWindow } = await import("@tauri-apps/api/window");
      await appWindow.setAlwaysOnTop(!!note.alwaysOnTop).catch(() => {});
    })();
  }, [note?.alwaysOnTop, note]);

  useEffect(() => {
    if (!window.__TAURI__) return;
    (async () => {
      const { appWindow, LogicalSize } = await import("@tauri-apps/api/window");
      if (note?.collapsed) {
        await appWindow.setSize(new LogicalSize(280, 44)).catch(() => {});
      } else {
        await appWindow.setSize(new LogicalSize(280, 320)).catch(() => {});
      }
    })();
  }, [note?.collapsed]);

  const handleUpdateNote = useCallback(
    async (changes) => {
      const safe = sanitizeUpdate(changes);
      safe.updatedAt = new Date().toISOString();
      await updateSingleNoteOnDisk(noteId, safe);
      const list = await loadNotesFromDisk();
      const n = list.find((x) => x.id === noteId);
      if (n) setNote(n);
      setAllNotes(list);
    },
    [noteId]
  );

  const handleRequestDelete = useCallback((id, noteName) => {
    setDeleteDialog({ noteId: id, noteName });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (deleteDialog) {
      await deleteNoteFromDisk(deleteDialog.noteId);
      await closeNativeNoteWindow(deleteDialog.noteId);
      setDeleteDialog(null);
    }
  }, [deleteDialog]);

  const handleCancelDelete = useCallback(() => {
    setDeleteDialog(null);
  }, []);

  const handleFocus = useCallback(() => {}, []);
  const handleCreateNote = useCallback(() => {
    createNoteOpenWindow();
  }, []);

  const handleFocusNote = useCallback((id) => {
    focusNativeNoteWindow(id);
  }, []);

  const handleCloseFloat = useCallback(async () => {
    if (window.__TAURI__) {
      await closeNativeNoteWindow(noteId);
    }
  }, [noteId]);

  if (!note) {
    return <div className="app-canvas note-window-root" />;
  }

  return (
    <div className="app-canvas note-window-root">
      <StickyNote
        isNativeWindow
        note={note}
        zIndex={1}
        onUpdate={(changes) => handleUpdateNote(changes)}
        onDelete={() => {}}
        onFocus={() => {}}
        onCreateNote={handleCreateNote}
        onRequestDelete={handleRequestDelete}
        onCloseFloat={handleCloseFloat}
        allNotes={allNotes}
        onFocusNote={handleFocusNote}
      />
      <AnimatePresence>
        {deleteDialog && (
          <DeleteDialog
            noteName={deleteDialog.noteName}
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Browser / dev: classic single-surface UI (no Tauri) ───
function BrowserMultiNoteApp() {
  const [notes, setNotes] = useState([]);
  const [focusOrder, setFocusOrder] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    loadNotesFromDisk().then((saved) => {
      if (saved && saved.length > 0) {
        setNotes(saved);
        setFocusOrder(saved.map((n) => n.id));
      } else {
        const first = createNote();
        setNotes([first]);
        setFocusOrder([first.id]);
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveNotesToDisk(notes);
    }, SAVE_DEBOUNCE);
    return () => clearTimeout(saveTimer.current);
  }, [notes, loaded]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        handleCreateNote();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleCreateNote = useCallback(() => {
    setNotes((prev) => {
      if (prev.length >= MAX_NOTES) {
        return prev;
      }
      const newNote = createNote();
      setFocusOrder((fo) => [...fo, newNote.id]);
      return [...prev, newNote];
    });
  }, []);

  const handleUpdateNote = useCallback((id, changes) => {
    const safeChanges = sanitizeUpdate(changes);
    safeChanges.updatedAt = new Date().toISOString();
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        return sanitizeNote({ ...n, ...safeChanges });
      })
    );
  }, []);

  const handleDeleteNote = useCallback((id) => {
    if (typeof id !== "string") return;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setFocusOrder((prev) => prev.filter((fid) => fid !== id));
  }, []);

  const handleRequestDelete = useCallback((noteId, noteName) => {
    setDeleteDialog({ noteId, noteName });
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (deleteDialog) {
      handleDeleteNote(deleteDialog.noteId);
      setDeleteDialog(null);
    }
  }, [deleteDialog, handleDeleteNote]);

  const handleCancelDelete = useCallback(() => {
    setDeleteDialog(null);
  }, []);

  const handleFocus = useCallback((id) => {
    if (typeof id !== "string") return;
    setFocusOrder((prev) => [...prev.filter((fid) => fid !== id), id]);
  }, []);

  const handleFocusNote = useCallback((id) => {
    if (typeof id !== "string") return;
    setFocusOrder((prev) => [...prev.filter((fid) => fid !== id), id]);
  }, []);

  return (
    <div className="app-canvas">
      <AnimatePresence>
        {notes.map((note) => (
          <StickyNote
            key={note.id}
            note={note}
            zIndex={focusOrder.indexOf(note.id) + 1}
            onUpdate={(changes) => handleUpdateNote(note.id, changes)}
            onDelete={() => handleDeleteNote(note.id)}
            onFocus={() => handleFocus(note.id)}
            onCreateNote={handleCreateNote}
            onRequestDelete={handleRequestDelete}
            allNotes={notes}
            onFocusNote={handleFocusNote}
          />
        ))}
      </AnimatePresence>
      <AnimatePresence>
        {deleteDialog && (
          <DeleteDialog
            noteName={deleteDialog.noteName}
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Root ───
export default function App({ noteId }) {
  if (noteId) {
    return <SingleNoteApp noteId={noteId} />;
  }
  if (!window.__TAURI__) {
    return <BrowserMultiNoteApp />;
  }
  return <ManagerApp />;
}
