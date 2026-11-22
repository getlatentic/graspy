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
 * The sprout's leaves span the wordmark's lowercase body (x-height top to
 * baseline) and its stem drops to the descender line. The wordmark is 126px
 * tall with its baseline at row 85, the sprout 24 units with its leaves at
 * 4.6 to 14 and its stem to 23, so at a 20px wordmark and a 28px sprout the
 * wordmark sits 4px lower. Every size keeps those ratios, and the lockup
 * grows with the screen so it still reads across a room.
 */
const SPROUT = "h-7 2xl:h-8.75 3xl:h-10.5 4xl:h-14 5xl:h-21";
const WORDMARK =
  "mt-1 h-5 w-auto 2xl:mt-1.25 2xl:h-6.25 3xl:mt-1.5 3xl:h-7.5 4xl:mt-2 4xl:h-10 5xl:mt-3 5xl:h-15";

/** `alt` sits on the wordmark alone so screen readers hear "graspy" once. */
export function Logo() {
  return (
    <span className="flex items-start gap-2 2xl:gap-2.5 3xl:gap-3 4xl:gap-4 5xl:gap-6">
      <SproutMark className={SPROUT} />
      <img
        src="/brand/wordmark.png"
        alt="graspy"
        width={532}
        height={126}
        className={WORDMARK}
      />
    </span>
  );
}
