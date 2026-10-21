import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
export interface Settings {
  fontSize: number;
  scrollback: number;
  theme: "dark" | "light";
  cursorStyle: "bar" | "block" | "underline";
  logRetentionDays: number;
}
export const defaultSettings: Settings = { fontSize: 14, scrollback: 5000, theme: "light", cursorStyle: "bar", logRetentionDays: 30 };
function applyTheme(theme: Settings["theme"]) { document.documentElement.dataset.theme = theme; }
export const useSettingsStore = create<{ settings: Settings; load: () => Promise<void>; save: (s: Settings) => Promise<void> }>((set) => ({
  settings: defaultSettings,
  load: async () => {
    const settings = await invoke<Settings>("settings_get");
    applyTheme(settings.theme); set({ settings });
  },
  save: async (settings) => {
    await invoke("settings_save", { settings });
    applyTheme(settings.theme); set({ settings });
  },
}));
