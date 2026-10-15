"use client";

import { useEffect } from "react";
import { useThemeStore } from "@state/theme.store";

export function ThemeBridge() {
  const hydrate = useThemeStore((s) => s.hydrate);
  const hydrated = useThemeStore((s) => s.hydrated);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.classList.remove("theme-light", "theme-dark-black", "theme-dark-blue");
    if (theme === "light") {
      root.classList.add("theme-light");
    } else if (theme === "dark-blue") {
      root.classList.add("theme-dark-blue");
    } else {
      root.classList.add("theme-dark-black");
    }
  }, [hydrated, theme]);

  return null;
}
