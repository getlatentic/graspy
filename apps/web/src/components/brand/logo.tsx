import { cn } from "@/lib/cn";

export function SproutMark({ className }: { className?: string }) {
  return (
    <img
      src="/brand/sprout.svg"
      alt=""
      width={24}
      height={24}
      className={cn("h-7 w-auto", className)}
    />
  );
}

/**
 * One SVG lockup: the sprout and the word "graspy" drawn together, so the two
 * line up by construction and stay sharp at any size. The sprout is as tall as
 * the word's ink, from the x-height top to the bottom of the descenders, and
 * the viewBox is cropped to the ink, so the sprout's left edge is the logo's
 * left edge. Its ink is 20px tall at the header size, and the lockup grows at
 * 2xl, 3xl, 4xl and 5xl so it still reads across a room. The file name carries
 * a version because the service worker caches /brand by path.
 */
const LOCKUP = "h-5 2xl:h-6.25 3xl:h-7.5 4xl:h-10 5xl:h-15";

/** `alt` is the lockup's own name, so screen readers hear "graspy" once. */
export function Logo() {
  return (
    <img
      src="/brand/graspy-lockup-v1.svg"
      alt="graspy"
      width={4552}
      height={836}
      className={cn("block w-auto", LOCKUP)}
    />
  );
}
