export const THEME_OPTIONS = [
  { id: "light", label: "Kivo Light", appearance: "light", icon: "sun", preview: { bg: "hsl(38 38% 93%)", card: "hsl(42 30% 97%)", accent: "hsl(217 78% 54%)" } },
  { id: "vscode-light", label: "VS Light", appearance: "light", icon: "code2", preview: { bg: "hsl(0 0% 100%)", card: "hsl(0 0% 95%)", accent: "hsl(209 100% 42%)" } },
  { id: "one-light", label: "One Light", appearance: "light", icon: "flask", preview: { bg: "hsl(220 18% 95%)", card: "hsl(220 24% 98%)", accent: "hsl(220 83% 56%)" } },
  { id: "solarized-light", label: "Solarized Light", appearance: "light", icon: "sunrise", preview: { bg: "hsl(44 87% 94%)", card: "hsl(44 70% 96%)", accent: "hsl(175 59% 38%)" } },
  { id: "gruvbox-light", label: "Gruvbox Light", appearance: "light", icon: "wheat", preview: { bg: "hsl(43 38% 92%)", card: "hsl(42 35% 95%)", accent: "hsl(24 95% 34%)" } },
  { id: "dark", label: "Kivo Dark", appearance: "dark", icon: "moon", preview: { bg: "hsl(225 13% 12%)", card: "hsl(222 14% 16%)", accent: "hsl(217 92% 67%)" } },
  { id: "vscode-dark", label: "VS Code Dark", appearance: "dark", icon: "code2", preview: { bg: "hsl(220 13% 12%)", card: "hsl(220 13% 15%)", accent: "hsl(207 100% 42%)" } },
  { id: "monokai-dark", label: "Monokai", appearance: "dark", icon: "zap", preview: { bg: "hsl(65 6% 15%)", card: "hsl(70 8% 12%)", accent: "hsl(336 95% 56%)" } },
  { id: "one-dark", label: "One Dark", appearance: "dark", icon: "beaker", preview: { bg: "hsl(219 13% 18%)", card: "hsl(220 14% 21%)", accent: "hsl(212 82% 64%)" } },
  { id: "solarized-dark", label: "Solarized Dark", appearance: "dark", icon: "sunrise", preview: { bg: "hsl(193 58% 14%)", card: "hsl(192 57% 18%)", accent: "hsl(175 74% 35%)" } },
  { id: "tomorrow-night-blue", label: "Tomorrow Night Blue", appearance: "dark", icon: "building", preview: { bg: "hsl(225 39% 14%)", card: "hsl(226 35% 18%)", accent: "hsl(200 100% 60%)" } },
  { id: "gruber-darker", label: "Gruber Darker", appearance: "dark", icon: "terminal", preview: { bg: "hsl(0 0% 9%)", card: "hsl(0 0% 16%)", accent: "hsl(53 100% 60%)" } },
  { id: "gruvbox-dark", label: "Gruvbox Dark", appearance: "dark", icon: "flame", preview: { bg: "hsl(0 0% 16%)", card: "hsl(24 6% 13%)", accent: "hsl(43 89% 58%)" } },
  { id: "nord", label: "Nord", appearance: "dark", icon: "snowflake", preview: { bg: "hsl(220 17% 16%)", card: "hsl(220 18% 20%)", accent: "hsl(193 43% 67%)" } },
  { id: "tokyo-night", label: "Tokyo Night", appearance: "dark", icon: "building", preview: { bg: "hsl(235 23% 14%)", card: "hsl(235 24% 18%)", accent: "hsl(204 86% 68%)" } },
  { id: "dracula", label: "Dracula", appearance: "dark", icon: "git-branch", preview: { bg: "hsl(231 15% 18%)", card: "hsl(231 15% 22%)", accent: "hsl(265 89% 78%)" } },
];

export const DEFAULT_LIGHT_THEME = "light";
export const DEFAULT_DARK_THEME = "dark";

const THEME_IDS = new Set(THEME_OPTIONS.map((theme) => theme.id));

export function isValidTheme(theme) {
  return THEME_IDS.has(theme);
}

export function getThemeAppearance(theme) {
  return THEME_OPTIONS.find((item) => item.id === theme)?.appearance === "light" ? "light" : "dark";
}

export function getNextToggleTheme(theme) {
  const currentIndex = THEME_OPTIONS.findIndex((item) => item.id === theme);
  if (currentIndex < 0) {
    return THEME_OPTIONS[0]?.id ?? DEFAULT_LIGHT_THEME;
  }
  return THEME_OPTIONS[(currentIndex + 1) % THEME_OPTIONS.length].id;
}

export function getThemeMeta(theme) {
  return THEME_OPTIONS.find((item) => item.id === theme) ?? THEME_OPTIONS[0];
}
