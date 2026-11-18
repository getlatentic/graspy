import { cn } from "@/lib/cn";

const SKIN = "#a9693f";
const HAIR = "#2b1d17";

/** A learner kneeling by a sprout, drawn on a 400 by 300 board with the child near the middle. */
function Learner() {
  return (
    <g>
      <rect
        x="128"
        y="158"
        width="40"
        height="70"
        rx="16"
        className="fill-accent-strong"
      />
      <path
        d="M150 236 h118 a17 17 0 0 1 0 34 h-118z"
        className="fill-accent-strong"
      />
      <ellipse cx="146" cy="262" rx="26" ry="14" className="fill-accent" />
      <rect
        x="150"
        y="150"
        width="76"
        height="92"
        rx="30"
        className="fill-surface"
      />
      <rect x="150" y="196" width="76" height="14" className="fill-accent" />
      <path
        d="M214 176 L268 222"
        stroke={SKIN}
        strokeWidth="15"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="270" cy="224" r="10" fill={SKIN} />
      <circle cx="190" cy="118" r="36" fill={SKIN} />
      <circle cx="162" cy="96" r="18" fill={HAIR} />
      <circle cx="190" cy="88" r="22" fill={HAIR} />
      <circle cx="216" cy="98" r="17" fill={HAIR} />
      <path
        d="M156 104 Q190 84 224 104"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
        className="text-accent"
      />
      <circle cx="204" cy="120" r="5" fill={HAIR} />
      <circle cx="182" cy="120" r="5" fill={HAIR} />
      <path
        d="M186 138 Q198 150 212 138"
        stroke={HAIR}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M278 270 C278 250 280 238 284 226"
        className="stroke-accent-strong"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M284 230 C262 232 250 220 248 204 C268 202 282 212 284 230Z"
        className="fill-accent-strong"
      />
      <path
        d="M286 224 C292 204 306 196 322 198 C322 216 310 228 286 224Z"
        className="fill-accent"
      />
    </g>
  );
}

/** A learner with a sprout under a sun. It stands in for a photograph and fills any box. */
export function Scene({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={cn("block size-full", className)}
    >
      <rect width="400" height="300" className="fill-accent-soft" />
      <ellipse cx="70" cy="60" rx="90" ry="60" className="fill-accent-line" />
      <circle cx="250" cy="52" r="28" className="fill-accent" />
      <circle cx="250" cy="52" r="9" className="fill-surface" />
      <ellipse cx="200" cy="318" rx="320" ry="86" className="fill-accent/45" />
      <Learner />
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
      <ellipse cx="120" cy="30" rx="180" ry="60" className="fill-accent-line" />
      <circle cx="640" cy="48" r="26" className="fill-accent" />
      <circle cx="640" cy="48" r="8" className="fill-surface" />
      <ellipse cx="400" cy="200" rx="520" ry="70" className="fill-accent/45" />
      <g transform="translate(243 -44) scale(0.7)">
        <Learner />
      </g>
    </svg>
  );
}
