import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles/app.css";

// Apply the saved (or OS) theme before the first paint, so pages outside the
// app shell, like sign-in, match it too. The shell keeps it in sync afterwards.
function initialTheme() {
  try {
    const saved = localStorage.getItem("pi-theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch { /* storage blocked: fall back to OS setting */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
document.documentElement.dataset.theme = initialTheme();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);