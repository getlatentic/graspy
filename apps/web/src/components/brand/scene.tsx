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
      <circle cx="244" cy="80" r="40" className="fill-accent" />
      <circle cx="244" cy="80" r="13" className="fill-surface" />
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

/** The same scene laid out wide, for a strip across the top of a card. */
export function SceneBand({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 160"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={cn("block size-full", className)}
    >
      <rect width="800" height="160" className="fill-accent-soft" />
      <circle cx="660" cy="62" r="34" className="fill-accent" />
      <circle cx="660" cy="62" r="11" className="fill-surface" />
      <ellipse
        cx="180"
        cy="190"
        rx="360"
        ry="90"
        className="fill-accent-line"
      />
      <ellipse cx="640" cy="200" rx="380" ry="84" className="fill-accent/45" />
      <path
        d="M400 170 C400 140 404 120 410 100"
        className="stroke-accent-strong"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M410 104 C388 108 372 96 368 78 C392 76 408 86 410 104Z"
        className="fill-accent-strong"
      />
      <path
        d="M412 96 C418 72 436 60 460 62 C460 86 444 100 412 96Z"
        className="fill-accent"
      />
    </svg>
  );
}
