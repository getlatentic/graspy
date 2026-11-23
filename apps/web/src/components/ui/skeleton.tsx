import { cn } from "@/lib/cn";

/** A quiet block where content will be, so a page keeps its shape while its data is on the way. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      data-skeleton=""
      aria-hidden="true"
      className={cn(
        "rounded-small bg-line motion-safe:animate-pulse",
        className,
      )}
    />
  );
}
