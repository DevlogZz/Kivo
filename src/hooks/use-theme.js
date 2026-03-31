import { useEffect, useState } from "react";

const storageKey = "kivo-theme";
const themes = ["light", "dark"];

function getInitialTheme() {
  const savedTheme = window.localStorage.getItem(storageKey);

  if (themes.includes(savedTheme)) {
    return savedTheme;
  }

  return "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add(`theme-${theme}`);
    window.localStorage.setItem(storageKey, theme);
  }, [theme]);

  return {
    theme,
    setTheme,
    toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark"))
  };
}
