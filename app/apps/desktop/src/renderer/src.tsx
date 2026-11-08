import "./lib/host/install.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// React's development build records a performance.measure() for every component render (its
// Performance tracks) and the browser keeps every entry: a live scope re-rendering 40 times a second
// piled them up at ~20 MB/s until the renderer ran out of memory. Production builds record none.
if (import.meta.env.DEV) {
  window.setInterval(() => {
    performance.clearMeasures();
    performance.clearMarks();
  }, 5_000);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
