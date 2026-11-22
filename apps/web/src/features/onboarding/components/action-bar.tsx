import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The row of actions at the foot of a step. On a phone it stays at the foot of
 * the screen over a soft fade from the page's own ground, so it never drops out
 * of sight with a long list above it; from sm up it is part of the page.
 */
export function ActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-4 mt-auto bg-linear-to-t from-surface/80 via-surface/60 to-transparent px-4 pt-8 pb-[max(1rem,env(safe-area-inset-bottom))]",
        "sm:static sm:mx-0 sm:mt-8 sm:bg-none sm:p-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
