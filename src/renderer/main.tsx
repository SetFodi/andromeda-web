import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles/globals.css";
import "./styles/app.css";
import "./styles/bookmarks.css";

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
    const isDark = appearance !== "day";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    document.documentElement.dataset.appearance = appearance;
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("no-start-glow", localStorage.getItem("andromeda.startGlow") === "off");
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.appearance = "day";
  }
})();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
