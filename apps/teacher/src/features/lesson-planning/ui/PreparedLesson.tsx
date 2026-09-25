import { ClassworkText } from "../../classwork/ui/ClassworkText";
import type { LessonBlock, LessonContent } from "../domain/lessonContent";

/**
 * A prepared lesson, read as a lesson.
 *
 * graspy writes this, so a teacher's first job is to judge it, not to fill in
 * fields. The screen used to open every value in a bordered input with a
 * numbered step badge above it, which made reading it feel like data entry and
 * put a rule under every heading. Editing is now something a teacher chooses.
 *
 * Styled in Tailwind against the graspy tokens. As a stylesheet this view had
 * its width set in one file, its padding in another and its measure in a third,
 * and each fix moved a rule the other two did not know about.
 */

/** One size throughout; weight and colour carry the hierarchy, never size. */
// The design's section headings are dark and semibold at UI size, not a muted
// eyebrow — hierarchy comes from the scale, so a heading outranks its body
// while the lesson title outranks every heading.
const sectionLabel = "m-0 text-base font-semibold text-ink";
const bodyText = "text-ink-secondary leading-body";
/** Italic rather than bold: these sit under a step, not beside one. */
const subordinate = "font-normal italic text-ink";
const answerRow = "grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-sm";
const plainList = "grid m-0 p-0 list-none";

/** Each kind of block reads differently, so each is shown as what it is. */
function LessonBlockView({ block }: { readonly block: LessonBlock }) {
  if (block.type === "explanation") return <ClassworkText text={block.content} />;
  if (block.type === "worked_example") {
    return (
      <div className="grid gap-sm">
        <ClassworkText text={block.problem} />
        <ol className={`${plainList} gap-sm`}>
          {block.steps.map((step) => (
            <li className="grid gap-2xs" key={step.label}>
              <strong className={subordinate}>{step.label}</strong>
              <ClassworkText text={step.content} />
            </li>
          ))}
        </ol>
        <div className={answerRow}>
          <strong className={subordinate}>Answer</strong>
          <ClassworkText text={block.finalAnswer} />
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-sm">
      <ClassworkText text={block.question} />
    </div>
  );
}

export function PreparedLesson({ content }: { readonly content: LessonContent }) {
  return (
    <article
      // One size for the whole document: ClassworkText sets its own, so anything
      // outside it inherited the page default and read a step larger.
      className="[--classwork-measure:none] grid gap-2xl box-border w-full px-lg pt-xl pb-2xl
        text-base leading-body [&_.classwork-content]:max-w-none"
    >
      <section className="grid gap-md" aria-labelledby="prepared-goals">
        <h3 className={sectionLabel} id="prepared-goals">
          What learners will be able to do
        </h3>
        <ol className={`${plainList} gap-sm`}>
          {content.objectives.map((statement, index) => (
            <li className={bodyText} key={index}>
              {statement}
            </li>
          ))}
        </ol>
      </section>

      {content.instructionalMaterials.length ? (
        <section className="grid gap-md" aria-labelledby="prepared-instructional-materials">
          <h3 className={sectionLabel} id="prepared-instructional-materials">
            What to bring
          </h3>
          <p className={`m-0 ${bodyText}`}>{content.instructionalMaterials.join(" · ")}</p>
        </section>
      ) : null}

      <section className="grid gap-md" aria-labelledby="prepared-flow">
        <h3 className={sectionLabel} id="prepared-flow">
          How the lesson runs
        </h3>
        <ol className={`${plainList} gap-sm`}>
          {content.steps.map((step, index) => (
            <li key={step.id}>
              {/* The lesson reads as a timed outline; a step opens to the
                  drafted detail a teacher wants to check, rather than every
                  step's full text stacked into one wall. */}
              <details className="group border border-rule bg-paper open:bg-paper-soft">
                <summary className="flex items-center gap-md p-md cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <span className="grid place-items-center flex-none w-[26px] h-[26px] rounded-[8px] bg-paper-accent text-brand font-bold text-sm">
                    {index + 1}
                  </span>
                  <span className="flex-1 min-w-0 text-ink">{step.title}</span>
                  {step.durationMinutes != null ? (
                    <span className="flex-none whitespace-nowrap text-sm text-muted">
                      {step.durationMinutes} min
                    </span>
                  ) : null}
                  <svg
                    className="flex-none text-muted transition-transform group-open:rotate-90"
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M6 4l4 4-4 4z" />
                  </svg>
                </summary>
                <div className="grid gap-sm pb-md pr-md pl-[58px]">
                  {step.summary ? <p className={`m-0 ${bodyText}`}>{step.summary}</p> : null}
                  {step.blocks.map((block) => (
                    <LessonBlockView block={block} key={block.id} />
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ol>
      </section>

      {content.checks.length ? (
        <section className="grid gap-md" aria-labelledby="prepared-checks">
          <h3 className={sectionLabel} id="prepared-checks">
            Homework
          </h3>
          <ol className={`${plainList} gap-lg`}>
            {content.checks.map((check) => (
              <li className="grid gap-2xs" key={check.id}>
                <ClassworkText text={check.question} />
                <div className={answerRow}>
                  <strong className={subordinate}>Answer</strong>
                  <ClassworkText text={check.expectedAnswer} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
