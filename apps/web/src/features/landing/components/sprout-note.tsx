import "@fontsource/caveat/latin-500.css";
import { cn } from "@/lib/cn";

export function SproutNote({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none select-none", className)}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 size-full text-accent-soft"
      >
        <path
          fill="currentColor"
          d="M44 18C76-2 136 4 170 34s32 86 8 122-80 48-120 36S4 150 6 106 12 38 44 18Z"
        />
        <path
          fill="currentColor"
          opacity="0.7"
          d="M70 40c30-12 78-6 96 22s10 70-18 88-74 18-96-2-20-58-6-80 12-20 24-28Z"
          className="text-surface"
        />
      </svg>
      <img
        src="/brand/sprout.svg"
        alt=""
        width={24}
        height={24}
        className="absolute end-10 top-2 size-20 sm:size-24"
      />
      <p className="absolute end-2 bottom-2 w-20 -rotate-6 font-hand text-base leading-tight text-accent-strong">
        Questions today.
        <br />
        Progress tomorrow.
        <svg viewBox="0 0 60 8" className="mt-1 h-2 w-14 text-accent-ink">
          <path
            d="M2 6 C 18 1, 38 1, 58 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </p>
    </div>
  );
}
