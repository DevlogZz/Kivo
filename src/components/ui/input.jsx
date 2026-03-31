import { cn } from "@/lib/utils.js";

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "flex h-8 w-full border border-border/35 bg-input/70 px-2.5 text-[12px] text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
      {...props}
    />
  );
}
