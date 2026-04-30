import {
  Beaker,
  Building2,
  Code2,
  Flame,
  FlaskConical,
  GitBranch,
  Github,
  MoonStar,
  Snowflake,
  SunMedium,
  Sunrise,
  TerminalSquare,
  Wheat,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button.jsx";
import { getThemeMeta } from "@/lib/themes.js";

const THEME_ICON_MAP = {
  sun: SunMedium,
  flask: FlaskConical,
  github: Github,
  sunrise: Sunrise,
  wheat: Wheat,
  moon: MoonStar,
  beaker: Beaker,
  "git-branch": GitBranch,
  terminal: TerminalSquare,
  flame: Flame,
  snowflake: Snowflake,
  building: Building2,
  zap: Zap,
  code2: Code2,
};

export function ThemeToggle({ theme, onToggle }) {
  const themeMeta = getThemeMeta(theme);
  const ThemeIcon = THEME_ICON_MAP[themeMeta.icon] ?? SunMedium;

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 rounded-sm border-border/40 bg-card/40 px-2.5 text-[11px] text-foreground"
      onClick={onToggle}
      type="button"
      title={`Switch theme (current: ${themeMeta.label})`}
    >
      <ThemeIcon className="h-3.5 w-3.5" />
      <span className="leading-none">{themeMeta.label}</span>
    </Button>
  );
}
