import type { ReactNode } from "react";

/**
 * A part of the lesson a teacher may write themselves, folded away until they do.
 *
 * The hint is only true while the part is empty — shown over a section already
 * open and already filled from a weekly plan, "graspy writes these" said the
 * opposite of what the screen showed.
 */
export function WritableSection({
  title,
  open,
  className,
  children,
}: {
  readonly title: string;
  readonly open: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <details className={`group/form py-md${className ? ` ${className}` : ""}`} open={open}>
      <summary className={sectionFold}>
        <span>{title}</span>
        {open ? null : (
          <span className="ms-auto text-sm font-normal text-muted">
            graspy will write these for you
          </span>
        )}
      </summary>
      {children}
    </details>
  );
}

/**
 * The row that opens a section graspy would otherwise write. Its height is
 * stated because a bold line of text is not a target a teacher can tap on a
 * tablet.
 */
const sectionFold =
  "flex min-h-[2.75rem] cursor-pointer items-center gap-md text-md font-bold leading-heading text-ink [&::-webkit-details-marker]:hidden after:content-[''] after:size-[0.45rem] after:rotate-45 after:border-e-2 after:border-b-2 after:border-accent after:transition-transform after:duration-[var(--dur-short)] after:ease-[var(--ease-out)] group-open/form:after:-rotate-[135deg] motion-reduce:after:transition-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-4";
