import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, useMotionValue, useSpring, AnimatePresence } from "framer-motion";
import { COLORS } from "../stores/noteStore";

const DRAG_SPRING = { type: "spring", stiffness: 600, damping: 35, mass: 0.5 };
const SNAP_THRESHOLD = 30;
const EDGE_PADDING = 8;

export default function StickyNote({
  note, onUpdate, onDelete, onCreateNote,
  zIndex, onFocus, onRequestDelete,
  allNotes, onFocusNote,
  isNativeWindow = false,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFinder, setShowFinder] = useState(false);
  const [finderSearch, setFinderSearch] = useState("");
  const finderInputRef = useRef(null);
  const editorRef = useRef(null);
  const noteRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // ─── SPRING POSITION ────────────────────────────────────
  const motionX = useMotionValue(note.x);
  const motionY = useMotionValue(note.y);
  const springX = useSpring(motionX, DRAG_SPRING);
  const springY = useSpring(motionY, DRAG_SPRING);

  useEffect(() => {
    if (!isDragging) { motionX.set(note.x); motionY.set(note.y); }
  }, [note.x, note.y, isDragging]);

  const colorObj = COLORS.find((c) => c.name === note.color) || COLORS[0];

  // Keep editor DOM in sync when note loads or switches from another note (not while typing).
  useEffect(() => {
    if (!editorRef.current) return;
    const el = editorRef.current;
    if (document.activeElement === el) return;
    const incoming = note.content || "";
    if (incoming !== el.innerHTML) el.innerHTML = incoming;
  }, [note.id, note.content]);

  // ─── DRAG ───────────────────────────────────────────────
  const handleDragStart = useCallback((e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
    if (e.target.closest?.('[contenteditable="true"]')) return;
    e.preventDefault();
    setIsDragging(true);
    onFocus();
    const rect = noteRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    springX.stop(); springY.stop();
  }, [onFocus, springX, springY]);

  const handleNativeDragStart = useCallback((e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
    if (e.target.closest?.('[contenteditable="true"]')) return;
    e.preventDefault();
    onFocus();
    if (window.__TAURI__) {
      import("@tauri-apps/api/window").then(({ appWindow }) => {
        appWindow.startDragging();
      });
    }
  }, [onFocus]);

  useEffect(() => {
    if (!isNativeWindow || !window.__TAURI__) return undefined;
    let timer;
    let unMove;
    let unResize;
    (async () => {
      const { appWindow } = await import("@tauri-apps/api/window");
      unMove = await appWindow.onMoved(({ payload }) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          onUpdate({ x: payload.x, y: payload.y });
        }, 280);
      });
      unResize = await appWindow.onResized(({ payload }) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          onUpdate({ width: payload.width, height: payload.height });
        }, 280);
      });
    })();
    return () => {
      clearTimeout(timer);
      unMove?.();
      unResize?.();
    };
  }, [isNativeWindow, onUpdate]);

  useEffect(() => {
    if (isNativeWindow || !isDragging) return;
    const handleMove = (e) => {
      let newX = e.clientX - dragOffset.current.x;
      let newY = e.clientY - dragOffset.current.y;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const noteW = note.width;
      const noteH = note.height;
      if (newX < SNAP_THRESHOLD) newX = EDGE_PADDING;
      if (newY < SNAP_THRESHOLD) newY = EDGE_PADDING;
      if (newX + noteW > w - SNAP_THRESHOLD) newX = w - noteW - EDGE_PADDING;
      if (newY + noteH > h - SNAP_THRESHOLD) newY = h - noteH - EDGE_PADDING;
      motionX.set(newX); motionY.set(newY);
    };
    const handleUp = () => {
      setIsDragging(false);
      onUpdate({ x: motionX.get(), y: motionY.get() });
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => { window.removeEventListener("mousemove", handleMove); window.removeEventListener("mouseup", handleUp); };
  }, [isNativeWindow, isDragging, motionX, motionY, note.width, note.height, onUpdate]);

  const applyTextFormat = (cmd) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(cmd, false);
    onUpdate({ content: editorRef.current.innerHTML });
  };

  const applyHeading = (tag) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand("formatBlock", false, tag);
    onUpdate({ content: editorRef.current.innerHTML });
  };

  const insertTodo = () => {
    editorRef.current?.focus();
    const sel = window.getSelection();

    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      // Has selection — wrap each line
      const range = sel.getRangeAt(0);
      const fragment = range.extractContents();
      const lines = [];

      // Split fragment into lines by div/p/br or text nodes
      fragment.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          lines.push(node.textContent.trim());
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const text = node.innerText || node.textContent || "";
          if (text.trim()) lines.push(text.trim());
        }
      });

      if (lines.length === 0) lines.push("");

      const wrapper = document.createDocumentFragment();
      lines.forEach((text) => {
        const div = document.createElement("div");
        div.className = "todo-line";
        div.innerHTML = `<label><input type="checkbox" class="todo-checkbox" />&nbsp;<span class="todo-text">${text}</span></label>`;
        wrapper.appendChild(div);
      });

      range.insertNode(wrapper);
    } else {
      // No selection — insert empty todo at cursor
      document.execCommand("insertHTML", false, "<div class=\"todo-line\"><label><input type=\"checkbox\" class=\"todo-checkbox\" />&nbsp;<span class=\"todo-text\"></span></label></div>");
    }

    onUpdate({ content: editorRef.current.innerHTML });
  };

  const handleEditorKeyDown = (e) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const node = sel.anchorNode;
    const todoLine = node?.parentElement?.closest(".todo-line")
      || node?.closest?.(".todo-line");

    if (todoLine) {
      if (e.key === "Enter") {
        e.preventDefault();
        // Insert another todo line after current
        const newTodo = document.createElement("div");
        newTodo.className = "todo-line";
        newTodo.innerHTML = "<label><input type=\"checkbox\" class=\"todo-checkbox\" />&nbsp;<span class=\"todo-text\"></span></label>";
        todoLine.after(newTodo);
        // Focus the new span
        const span = newTodo.querySelector(".todo-text");
        if (span) {
          const range = document.createRange();
          range.setStart(span, 0);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        onUpdate({ content: editorRef.current.innerHTML });
      }

      if (e.key === "Backspace") {
        const span = todoLine.querySelector(".todo-text");
        const text = span?.textContent || "";
        if (text === "") {
          e.preventDefault();
          // Replace todo-line with a plain div
          const plain = document.createElement("div");
          plain.innerHTML = "<br/>";
          todoLine.replaceWith(plain);
          // Move cursor to new plain div
          const range = document.createRange();
          range.setStart(plain, 0);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          onUpdate({ content: editorRef.current.innerHTML });
        }
      }
    }
  };

  // ─── FINDER ────────────────────────────────────────────
  const toggleFinder = useCallback(() => {
    setShowFinder((v) => {
      if (!v) {
        setFinderSearch("");
        setTimeout(() => finderInputRef.current?.focus(), 60);
      }
      return !v;
    });
  }, []);

  function textFromRichContent(html) {
    if (!html || typeof html !== "string") return "";
    if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ").trim();
    const d = document.createElement("div");
    d.innerHTML = html;
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }

  function getNoteDisplayName(n) {
    if (n.title && n.title.trim()) return n.title.trim();
    const text = textFromRichContent(n.content || "");
    const words = text.trim().split(/\s+/).slice(0, 3).join(" ");
    return words || "Untitled";
  }

  const filteredNotes = (allNotes || []).filter((n) => {
    const name = getNoteDisplayName(n).toLowerCase();
    return name.includes(finderSearch.toLowerCase());
  });

  // ─── AUTO TITLE ─────────────────────────────────────────
  function getDisplayName() {
    if (note.title && note.title.trim()) return note.title.trim();
    const text = textFromRichContent(note.content || "");
    const words = text.trim().split(/\s+/).slice(0, 3).join(" ");
    return words || "Untitled";
  }

  // ─── RENDER ─────────────────────────────────────────────
  const bgWithOpacity = colorObj.bg.replace(/[\d.]+\)$/, `1)`);
  const useGlass = note.opacity < 1;

  const layoutStyle = isNativeWindow
    ? {
        position: "fixed",
        left: 0,
        top: 0,
        width: "100%",
        height: note.collapsed ? "44px" : "100%",
        zIndex: 1,
      }
    : {
        position: "absolute",
        left: springX,
        top: springY,
        width: note.width,
        height: note.collapsed ? "44px" : note.height,
        zIndex: isDragging ? 10000 : zIndex,
      };

  return (
    <motion.div
      ref={noteRef}
      className={`sticky-note ${useGlass ? "sticky-note--glass" : ""} ${isDragging ? "is-dragging" : ""} ${isNativeWindow ? "native-window" : ""}`}
      style={{
        ...layoutStyle,
        background: bgWithOpacity,
      }}
      initial={{ scale: 0.85, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.7, opacity: 0, y: -10, transition: { duration: 0.2, ease: "easeIn" } }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      onMouseDown={() => onFocus()}
    >
      {/* ─── Header ─── */}
      <div className="note-header" onMouseDown={isNativeWindow ? handleNativeDragStart : handleDragStart}>
        {/* Home — left side */}
        <div
          className="ctrl-icon"
          onClick={(e) => { e.stopPropagation(); toggleFinder(); }}
          title="All floats"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
        </div>

        {/* Title — center */}
        <input
          className="note-title-input"
          value={note.title || ""}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Untitled"
          onMouseDown={(e) => e.stopPropagation()}
        />

        {/* Right controls */}
        <div className="note-header-controls">
          <div className="ctrl-icon color-icon" onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }} title="Color">
            <span className="header-color-dot" style={{ background: colorObj.solid }} />
          </div>
          <div className="ctrl-icon" onClick={(e) => { e.stopPropagation(); onUpdate({ collapsed: !note.collapsed }); }} title="Collapse">
            {note.collapsed ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            )}
          </div>
          <div
            className="ctrl-icon"
            onClick={(e) => {
              e.stopPropagation();
              if (window.__TAURI__) {
                import("@tauri-apps/api/window").then(({ appWindow }) => {
                  appWindow.isMaximized().then((m) => (m ? appWindow.unmaximize() : appWindow.maximize()));
                });
              }
            }}
            title="Full screen"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </div>
          <div className="ctrl-icon" onClick={(e) => { e.stopPropagation(); onCreateNote(); }} title="New float">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
        </div>
      </div>

      {/* ─── Color Picker Dropdown ─── */}
      <AnimatePresence>
        {showColorPicker && (
          <>
            <div className="dropdown-overlay" onClick={() => setShowColorPicker(false)} />
            <motion.div
              className="color-dropdown"
              initial={{ opacity: 0, scale: 0.92, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -4 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <span className="color-dropdown-label">Color</span>
              <div className="color-grid">
                {COLORS.map((c) => (
                  <div
                    key={c.name}
                    className={`color-swatch ${note.color === c.name ? "active" : ""}`}
                    style={{ background: c.solid }}
                    onClick={() => { onUpdate({ color: c.name }); setShowColorPicker(false); }}
                  />
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {showFinder ? (
        <div className="floats-screen">
          <div className="floats-screen-top">
            <button
              type="button"
              className="floats-back-btn"
              onClick={(e) => { e.stopPropagation(); setShowFinder(false); }}
            >
              ←
            </button>
            <div className="floats-screen-heading">
              <h2 className="floats-screen-title">Floats</h2>
              <span className="floats-screen-count">{filteredNotes.length}</span>
            </div>
          </div>
          <input
            ref={finderInputRef}
            className="finder-search floats-screen-search"
            type="text"
            placeholder="Search floats…"
            value={finderSearch}
            onChange={(e) => setFinderSearch(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <div className="finder-list floats-screen-list">
            {filteredNotes.length === 0 && (
              <div className="finder-empty">No floats found</div>
            )}
            {filteredNotes.map((n) => {
              const c = COLORS.find((cl) => cl.name === n.color) || COLORS[0];
              const isCurrent = n.id === note.id;
              return (
                <div
                  key={n.id}
                  className={`finder-item ${isCurrent ? "current" : ""}`}
                  onClick={() => {
                    if (!isCurrent) onFocusNote(n.id);
                    setShowFinder(false);
                  }}
                >
                  <div className="finder-item-dot" style={{ background: c.solid }} />
                  <div className="finder-item-info">
                    <span className="finder-item-name">{getNoteDisplayName(n)}</span>
                    {isCurrent && <span className="finder-item-badge current-badge">Open</span>}
                  </div>
                  <span className="finder-item-type">Note</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
      <div className="note-editor-column">
        <div className="note-toolbar">
          <button className="note-toolbar-btn" onClick={() => applyTextFormat("bold")}>B</button>
          <button className="note-toolbar-btn italic-btn" onClick={() => applyTextFormat("italic")}>I</button>
          <button className="note-toolbar-btn" onClick={() => applyTextFormat("underline")}>U</button>
          <button className="note-toolbar-btn" onClick={() => applyTextFormat("strikeThrough")}>S</button>
          <button className="note-toolbar-btn" onClick={() => applyHeading("h1")}>H1</button>
          <button className="note-toolbar-btn" onClick={() => applyHeading("h2")}>H2</button>
          <button className="note-toolbar-btn" onClick={() => applyHeading("h3")}>H3</button>
          <div className="note-toolbar-divider" />
          {/* Bullet list */}
          <button
            className="note-toolbar-btn"
            onClick={() => {
              editorRef.current?.focus();
              document.execCommand("insertUnorderedList");
              onUpdate({ content: editorRef.current.innerHTML });
            }}
            title="Bullet list"
          >
            •≡
          </button>
          {/* To-do item */}
          <button
            className="note-toolbar-btn"
            onClick={insertTodo}
            title="To-do item"
          >
            ☐—
          </button>
          <button className="note-toolbar-btn delete-toolbar-btn"
            onClick={(e) => { e.stopPropagation(); onRequestDelete(note.id, getDisplayName()); }}
            title="Delete float">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e03030" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>

      {/* ─── Body ─── */}
      <AnimatePresence mode="wait">
          <motion.div
            className="note-body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            <div
              ref={editorRef}
              className="note-editor"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Start typing..."
              onInput={(e) => onUpdate({ content: e.currentTarget.innerHTML })}
              onKeyDown={handleEditorKeyDown}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </motion.div>
      </AnimatePresence>
      </div>
      )}
    </motion.div>
  );
}
