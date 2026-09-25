import { cn } from "@/lib/cn";

/** currentColor borders, so it never goes invisible on its surface. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60",
        className,
      )}
    />
  );
}
