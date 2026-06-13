import { useCallback, useEffect, useRef, useState } from "react";
import { SEARCH_ENGINES, SearchEngineId, setSearchEngine } from "../utils/url";

export type AddressBarPlacement = "toolbar" | "sidebar";

export type ToolbarButtonKey = "bookmark" | "split" | "downloads" | "reader" | "siteInfo";

export type ToolbarButtons = Record<ToolbarButtonKey, boolean>;

export type SettingsPatch = Partial<Omit<Settings, "toolbarButtons">> & {
  toolbarButtons?: Partial<ToolbarButtons>;
};

export type Settings = {
  name: string;
  searchEngine: SearchEngineId;
  appearanceAccent: string;
  addressBarPlacement: AddressBarPlacement;
  toolbarButtons: ToolbarButtons;
};

export const TOOLBAR_BUTTON_KEYS: ToolbarButtonKey[] = [
  "bookmark",
  "split",
  "downloads",
  "reader",
  "siteInfo"
];

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

const DEFAULT_TOOLBAR_BUTTONS: ToolbarButtons = {
  bookmark: true,
  split: true,
  downloads: true,
  reader: true,
  siteInfo: true
};

const DEFAULT_SETTINGS: Settings = {
  name: "",
  searchEngine: "google",
  appearanceAccent: "#f28366",
  addressBarPlacement: "toolbar",
  toolbarButtons: DEFAULT_TOOLBAR_BUTTONS
};

function sanitizeAccent(value: unknown): string {
  return typeof value === "string" && APPEARANCE_ACCENTS.includes(value)
    ? value
    : DEFAULT_SETTINGS.appearanceAccent;
}

function sanitizePlacement(value: unknown): AddressBarPlacement {
  return value === "sidebar" ? "sidebar" : "toolbar";
}

function sanitizeToolbarButtons(value: unknown): ToolbarButtons {
  const source = (value ?? {}) as Partial<Record<ToolbarButtonKey, unknown>>;
  const result = { ...DEFAULT_TOOLBAR_BUTTONS };
  for (const key of TOOLBAR_BUTTON_KEYS) {
    if (typeof source[key] === "boolean") {
      result[key] = source[key] as boolean;
    }
  }
  return result;
}

function toolbarButtonsEqual(a: ToolbarButtons, b: ToolbarButtons): boolean {
  return TOOLBAR_BUTTON_KEYS.every((key) => a[key] === b[key]);
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<Settings>;
    const name = typeof parsed.name === "string" ? parsed.name : DEFAULT_SETTINGS.name;
    const searchEngine =
      typeof parsed.searchEngine === "string" && parsed.searchEngine in SEARCH_ENGINES
        ? (parsed.searchEngine as SearchEngineId)
        : DEFAULT_SETTINGS.searchEngine;
    const appearanceAccent = sanitizeAccent(parsed.appearanceAccent);
    const addressBarPlacement = sanitizePlacement(parsed.addressBarPlacement);
    const toolbarButtons = sanitizeToolbarButtons(parsed.toolbarButtons);

    return { name, searchEngine, appearanceAccent, addressBarPlacement, toolbarButtons };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings(): {
  settings: Settings;
  updateSettings: (patch: SettingsPatch) => void;
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

  const updateSettings = useCallback((patch: SettingsPatch) => {
    setSettings((current) => {
      const next: Settings = {
        name: patch.name !== undefined ? patch.name : current.name,
        searchEngine: patch.searchEngine !== undefined ? patch.searchEngine : current.searchEngine,
        appearanceAccent:
          patch.appearanceAccent !== undefined ? sanitizeAccent(patch.appearanceAccent) : current.appearanceAccent,
        addressBarPlacement:
          patch.addressBarPlacement !== undefined
            ? sanitizePlacement(patch.addressBarPlacement)
            : current.addressBarPlacement,
        toolbarButtons:
          patch.toolbarButtons !== undefined
            ? sanitizeToolbarButtons({ ...current.toolbarButtons, ...patch.toolbarButtons })
            : current.toolbarButtons
      };

      if (
        next.name === current.name &&
        next.searchEngine === current.searchEngine &&
        next.appearanceAccent === current.appearanceAccent &&
        next.addressBarPlacement === current.addressBarPlacement &&
        toolbarButtonsEqual(next.toolbarButtons, current.toolbarButtons)
      ) {
        return current;
      }

      return next;
    });
  }, []);

  return { settings, updateSettings };
}
