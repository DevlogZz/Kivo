import { cn } from "@/lib/utils.js";

export function Card({ className, ...props }) {
  return <div className={cn("panel-surface", className)} {...props} />;
}
