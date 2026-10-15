"use client";

import { create } from "zustand";

export type Theme = "light" | "dark-black" | "dark-blue";

type ThemeState = {
  theme: Theme;
  hydrated: boolean;
  setTheme: (theme: Theme) => void;
  hydrate: () => void;
};

const STORAGE_KEY = "gms-theme";

const readTheme = (): Theme => {
  if (typeof window === "undefined") return "dark-black";
  const value = window.localStorage.getItem(STORAGE_KEY);
  if (value === "light" || value === "dark-blue") return value;
  return "dark-black";
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: "dark-black",
  hydrated: false,
  setTheme: (theme) =>
    set(() => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, theme);
      }
      return { theme };
    }),
  hydrate: () =>
    set(() => {
      return { theme: readTheme(), hydrated: true };
    }),
}));
