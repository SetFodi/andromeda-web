import { useCallback, useEffect, useRef, useState } from "react";
import { SEARCH_ENGINES, SearchEngineId, setSearchEngine } from "../utils/url";

export type Settings = {
  name: string;
  searchEngine: SearchEngineId;
};

const STORAGE_KEY = "andromeda.settings";

const DEFAULT_SETTINGS: Settings = {
  name: "Alex",
  searchEngine: "google"
};

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

    return { name, searchEngine };
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

  const [settings, setSettings] = useState<Settings>(initialRef.current);

  useEffect(() => {
    setSearchEngine(settings.searchEngine);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage failures
    }
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next: Settings = {
        name: patch.name !== undefined ? patch.name : current.name,
        searchEngine: patch.searchEngine !== undefined ? patch.searchEngine : current.searchEngine
      };

      if (next.name === current.name && next.searchEngine === current.searchEngine) {
        return current;
      }

      return next;
    });
  }, []);

  return { settings, updateSettings };
}
