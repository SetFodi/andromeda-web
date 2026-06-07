import { useCallback, useEffect, useRef, useState } from "react";
import { SEARCH_ENGINES, SearchEngineId, setSearchEngine } from "../utils/url";

export type Settings = {
  name: string;
  searchEngine: SearchEngineId;
  appearanceAccent: string;
};

const STORAGE_KEY = "andromeda.settings";
export const APPEARANCE_ACCENTS = [
  "#fff7dc",
  "#f0a9c3",
  "#d6a8d8",
  "#dc6f7b",
  "#f28366",
  "#decf77",
  "#5be0a3",
  "#97a5bd"
];

const DEFAULT_SETTINGS: Settings = {
  name: "Alex",
  searchEngine: "google",
  appearanceAccent: "#f28366"
};

function sanitizeAccent(value: unknown): string {
  return typeof value === "string" && APPEARANCE_ACCENTS.includes(value)
    ? value
    : DEFAULT_SETTINGS.appearanceAccent;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<Settings>;
    const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : DEFAULT_SETTINGS.name;
    const searchEngine =
      typeof parsed.searchEngine === "string" && parsed.searchEngine in SEARCH_ENGINES
        ? (parsed.searchEngine as SearchEngineId)
        : DEFAULT_SETTINGS.searchEngine;
    const appearanceAccent = sanitizeAccent(parsed.appearanceAccent);

    return { name, searchEngine, appearanceAccent };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings(): {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
} {
  const initialRef = useRef<Settings | null>(null);
  if (!initialRef.current) {
    initialRef.current = loadSettings();
    setSearchEngine(initialRef.current.searchEngine);
  }
  const lastSerializedRef = useRef(JSON.stringify(initialRef.current));

  const [settings, setSettings] = useState<Settings>(initialRef.current);

  useEffect(() => {
    setSearchEngine(settings.searchEngine);
    const serialized = JSON.stringify(settings);
    if (serialized === lastSerializedRef.current) {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      lastSerializedRef.current = serialized;
    } catch {
      // ignore storage failures
    }
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next: Settings = {
        name: patch.name !== undefined ? patch.name : current.name,
        searchEngine: patch.searchEngine !== undefined ? patch.searchEngine : current.searchEngine,
        appearanceAccent:
          patch.appearanceAccent !== undefined ? sanitizeAccent(patch.appearanceAccent) : current.appearanceAccent
      };

      if (
        next.name === current.name &&
        next.searchEngine === current.searchEngine &&
        next.appearanceAccent === current.appearanceAccent
      ) {
        return current;
      }

      return next;
    });
  }, []);

  return { settings, updateSettings };
}
