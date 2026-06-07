import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "glow" | "day" | "night";

const STORAGE_KEY = "andromeda.theme";
const THEME_ORDER: ThemeMode[] = ["glow", "day", "night"];

function normalizeTheme(value: string | null | undefined): ThemeMode | null {
  if (value === "glow" || value === "day" || value === "night") {
    return value;
  }

  if (value === "light") {
    return "day";
  }

  if (value === "dark") {
    return "night";
  }

  return null;
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode === "day" ? "light" : "dark";
  document.documentElement.dataset.appearance = mode;
}

function getInitialTheme(): ThemeMode {
  if (typeof document !== "undefined") {
    const applied = normalizeTheme(document.documentElement.dataset.appearance);
    if (applied) {
      return applied;
    }
  }

  try {
    const stored = normalizeTheme(localStorage.getItem(STORAGE_KEY));
    if (stored) {
      return stored;
    }
  } catch {
    // ignore storage failures
  }

  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
  }

  return "day";
}

export function useTheme(): { theme: ThemeMode; toggleTheme: () => void; setTheme: (mode: ThemeMode) => void } {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore storage failures
    }
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const currentIndex = THEME_ORDER.indexOf(current);
      return THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length];
    });
  }, []);

  return { theme, toggleTheme, setTheme };
}
