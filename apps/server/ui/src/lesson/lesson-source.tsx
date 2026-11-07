import type { LessonGrounding } from "@/lib/lesson";
import { fill, type LessonWords } from "@/shared/words";

/** What the lesson was written from: the curriculum's objectives for the topic and the textbook passages given to
 * the writer, with the textbook's attribution. A topic with no passage says so. */
export function LessonSource({
  grounding,
  words,
  open,
}: {
  grounding: LessonGrounding;
  words: LessonWords;
  open: boolean;
}) {
  const { authority, edition, objectives, passages, textbook } = grounding;
  return (
    <details
      open={open}
      className="rounded-card border border-line bg-surface p-4 text-sm text-muted"
    >
      <summary className="cursor-pointer font-medium text-ink">
        {fill(words.source, { authority, edition })}
      </summary>
      <div dir="auto" className="mt-3 space-y-3">
        {objectives.length > 0 && (
          <section aria-label={words.objectives}>
            <h2 className="font-semibold text-ink">{words.objectives}</h2>
            <ul className="mt-1 list-disc space-y-1 ps-5">
              {objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </section>
        )}
        {textbook && passages.length > 0 ? (
          <section aria-label={textbook.title}>
            <h2 className="font-semibold text-ink">
              {fill(words.textbook, { title: textbook.title })}
            </h2>
            <ul className="mt-1 list-disc space-y-1 ps-5">
              {passages.map((passage) => (
                <li key={`${passage.chapter}/${passage.title}`}>
                  {passage.title}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">{textbook.attribution}</p>
          </section>
        ) : (
          <p>{words.noPassages}</p>
        )}
      </div>
    </details>
  );
}
