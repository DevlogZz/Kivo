import { MoonStar, SunMedium } from "lucide-react";

import { Button } from "@/components/ui/button.jsx";

export function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 rounded-sm border-border/40 bg-card/40 px-2.5 text-[11px] text-foreground"
      onClick={onToggle}
      type="button"
    >
      {isDark ? <MoonStar className="h-3.5 w-3.5" /> : <SunMedium className="h-3.5 w-3.5" />}
      <span className="leading-none">{isDark ? "Dark" : "Light"}</span>
    </Button>
  );
}
