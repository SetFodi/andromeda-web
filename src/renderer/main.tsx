import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import "./styles/app.css";

// Apply the persisted theme before the first React paint so the shell never
// flashes the wrong palette on launch.
(() => {
  try {
    const stored = localStorage.getItem("andromeda.theme");
    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const appearance =
      stored === "glow" || stored === "day" || stored === "night"
        ? stored
        : stored === "light"
          ? "day"
          : stored === "dark" || prefersDark
            ? "night"
            : "day";
    document.documentElement.dataset.theme = appearance === "day" ? "light" : "dark";
    document.documentElement.dataset.appearance = appearance;
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.appearance = "day";
  }
})();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
