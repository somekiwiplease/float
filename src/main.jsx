import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

function getNoteIdFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return params.get("noteId") || null;
}

const noteId = getNoteIdFromLocation();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App noteId={noteId} />
  </React.StrictMode>
);
