import { cn } from "@/lib/cn";

/** A drawn sprout on a hill under a sun. It stands in for a photograph and fills any box. */
export function Scene({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={cn("block size-full", className)}
    >
      <rect width="400" height="300" className="fill-accent-soft" />
      <circle cx="292" cy="86" r="48" className="fill-accent" />
      <circle cx="292" cy="86" r="16" className="fill-surface" />
      <ellipse
        cx="90"
        cy="300"
        rx="260"
        ry="110"
        className="fill-accent-line"
      />
      <ellipse cx="330" cy="316" rx="260" ry="100" className="fill-accent/45" />
      <path
        d="M170 300 C170 250 176 214 186 186"
        className="stroke-accent-strong"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M186 190 C150 196 126 176 120 146 C158 142 184 158 186 190Z"
        className="fill-accent-strong"
      />
      <path
        d="M188 178 C196 140 224 120 262 124 C262 162 238 184 188 178Z"
        className="fill-accent"
      />
    </svg>
  );
}
