import { cn } from "@/lib/utils.js";

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        "flex min-h-[220px] w-full rounded-sm border border-border/35 bg-input/45 px-3 py-2.5 text-[12.5px] text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
      {...props}
    />
  );
}
