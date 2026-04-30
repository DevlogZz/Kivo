import { useEffect, useState } from "react";
import {
  DEFAULT_DARK_THEME,
  getNextToggleTheme,
  getThemeAppearance,
  isValidTheme,
  THEME_OPTIONS,
} from "@/lib/themes.js";

const storageKey = "kivo-theme";
const themeClassNames = THEME_OPTIONS.map((item) => `theme-${item.id}`);

function getInitialTheme() {
  const savedTheme = window.localStorage.getItem(storageKey);

  if (isValidTheme(savedTheme)) {
    return savedTheme;
  }

  return DEFAULT_DARK_THEME;
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.remove(...themeClassNames);
    document.documentElement.classList.add(`theme-${theme}`);
    window.localStorage.setItem(storageKey, theme);
  }, [theme]);

  return {
    theme,
    setTheme: (nextTheme) => {
      if (isValidTheme(nextTheme)) {
        setTheme(nextTheme);
      }
    },
    toggleTheme: () => setTheme((current) => getNextToggleTheme(current)),
    themeAppearance: getThemeAppearance(theme),
    themes: THEME_OPTIONS,
  };
}
