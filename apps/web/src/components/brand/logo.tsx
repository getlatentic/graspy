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

/** `alt` sits on the wordmark alone so screen readers hear "graspy" once. */
export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <SproutMark />
      <img
        src="/brand/wordmark.png"
        alt="graspy"
        width={532}
        height={126}
        className="h-5 w-auto"
      />
    </span>
  );
}
