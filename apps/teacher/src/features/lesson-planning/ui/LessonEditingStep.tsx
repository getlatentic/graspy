import type { ReactNode } from "react";

interface Props {
  /** Where this step sits in the order a teacher works through. */
  readonly step: number;
  /** Names the heading for assistive technology; the section points at it. */
  readonly id: string;
  readonly title: string;
  /** What this step is for, in the teacher's terms. */
  readonly description: string;
  /** Editing sections stay in the document while reading, so nothing reflows. */
  readonly hidden: boolean;
  readonly children: ReactNode;
}

/**
 * One numbered step of editing a lesson.
 *
 * The five steps carried the same eleven lines of scaffolding each — the rule
 * between them, the numbered badge, the heading and its label wiring — which is
 * five places to keep a heading tied to its section and five chances to break
 * it.
 *
 * `hidden` rather than not rendering: a teacher reading a lesson and a teacher
 * editing it are looking at the same document, and removing the fields would
 * move everything under them.
 */
export function LessonEditingStep({ step, id, title, description, hidden, children }: Props) {
  return (
    <section
      className="grid gap-lg border-b border-rule-strong px-lg py-xl"
      hidden={hidden}
      aria-labelledby={`${id}-heading`}
    >
      <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-md">
        <span className="grid size-[2rem] place-items-center bg-brand font-extrabold text-accent-ink">
          {step}
        </span>
        <div>
          <h2 className="m-0 text-ink" id={`${id}-heading`}>
            {title}
          </h2>
          <p className="m-0 mt-xs leading-body text-ink-secondary">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
