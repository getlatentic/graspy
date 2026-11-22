import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The row of actions at the foot of a step. Below the split layout it sticks
 * to the foot of the screen, so it never drops out of sight with a long list
 * above it; once it is stuck, a soft fade from the page's own ground, as wide
 * as the screen, keeps what scrolls under it from showing through. In the
 * split layout, where the form scrolls inside its own half, it is part of the
 * page. `html` keeps scroll-padding for the bar, so a focused control is never
 * left under it.
 */
export function ActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const place = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  // The marker sits where the bar would rest in the flow: below the screen means the bar is held up.
  useEffect(() => {
    const marker = place.current;
    if (!marker || typeof IntersectionObserver === "undefined") return;
    const watch = new IntersectionObserver(([entry]) =>
      setStuck(!entry.isIntersecting),
    );
    watch.observe(marker);
    return () => watch.disconnect();
  }, []);

  return (
    <>
      <div
        data-stuck={stuck}
        className={cn(
          "sticky bottom-0 z-10 mt-auto pt-8 pb-[max(1rem,env(safe-area-inset-bottom))]",
          "before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:bg-linear-to-t before:from-surface/80 before:via-surface/60 before:to-transparent before:opacity-0 before:transition-opacity data-[stuck=true]:before:opacity-100",
          "split:static split:mt-0 split:pb-0 split:before:hidden",
          className,
        )}
      >
        {children}
      </div>
      <div ref={place} aria-hidden="true" className="h-px" />
    </>
  );
}
