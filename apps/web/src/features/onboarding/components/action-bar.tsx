import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The row of actions at the foot of a step. Below lg it stays at the foot of
 * the screen, so it never drops out of sight with a long list above it: over a
 * soft fade from the page's own ground on a phone, and bare from sm up, where
 * the form is centred and a fade would show as a block. From lg up, where the
 * form scrolls inside its own half, it is part of the page.
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
        "sm:mx-0 sm:mt-8 sm:bg-none sm:px-0 sm:pt-0",
        "lg:static lg:pb-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
