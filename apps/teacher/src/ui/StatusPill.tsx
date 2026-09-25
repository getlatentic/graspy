import type { ReactNode } from "react";

/** What the state means, not what colour it happens to be. */
export type StatusTone =
  /** Finished, confirmed, or checked and sound. */
  | "positive"
  /** Live, changed, or otherwise worth noticing. */
  | "information"
  /** Waiting on the teacher. */
  | "attention"
  /** An ordinary state that carries no signal of its own. */
  | "neutral"
  /** Nothing here yet. */
  | "pending";

/* Text tones are the darkened brand values, each at or above 4.5:1 on its own
 * wash. The hairline is what survives forced-colours mode, where the wash is
 * dropped and the pill would otherwise lose its shape. */
const tones: Record<StatusTone, string> = {
  positive: "border-success/30 bg-success-soft text-success",
  information: "border-accent-active/30 bg-paper-accent text-accent-active",
  attention: "border-error/30 bg-error-soft text-error",
  neutral: "border-rule-strong/60 bg-rule text-ink-secondary",
  pending: "border-rule-strong bg-transparent text-ink-secondary",
};

const sizes = {
  sm: "min-h-[1.25rem] px-xs",
  md: "min-h-[1.5rem] px-sm",
};

/**
 * The state of one thing, said in the teacher's own words.
 *
 * A status is read, not operated, so the pill is a span and stays one: no
 * focus, no role, no place in the tab order. Several sit inside lesson rows
 * that are themselves buttons, where a nested control would be invalid.
 *
 * The label is never shortened. A status a teacher cannot finish reading is
 * not a status, so the pill holds its full width against a squeezing row, and
 * wraps to a second line only where the row itself is narrower than the words.
 */
export function StatusPill({
  tone,
  size = "md",
  className = "",
  children,
}: {
  readonly tone: StatusTone;
  readonly size?: keyof typeof sizes;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex max-w-full shrink-0 items-center justify-center rounded-pill border py-3xs text-center text-xs font-semibold leading-ui [overflow-wrap:anywhere] ${tones[tone]} ${sizes[size]} ${className}`}
    >
      {children}
    </span>
  );
}
