import type { ReferenceSource } from "../domain/lessonPlanning";

const chip =
  "inline-flex min-h-[1.75rem] items-center gap-2xs rounded-[8px] border border-rule bg-paper-soft px-sm text-xs text-ink-secondary [&>svg]:flex-none [&>svg]:text-muted";

/**
 * What a lesson answers to — its curriculum objective and its textbook — as the
 * two chips the design sets beneath the title.
 *
 * Both are drawn from the prepared lesson: the objective it serves and the
 * source its content came from, named once with the chapter. A lesson missing
 * either simply does not show that chip.
 *
 * It is handed the source rather than the excerpts behind it, because working
 * out which source a pile of excerpts came from is the same question wherever
 * a lesson is shown, and not a question about chips.
 */
export function LessonSourceChips({
  objective,
  source,
}: {
  readonly objective: string | null;
  readonly source: ReferenceSource | null;
}) {
  if (!objective && !source) return null;
  return (
    <div className="mt-md flex flex-wrap gap-xs">
      {objective ? (
        <span className={chip}>
          <svg viewBox="0 0 32 32" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M10 6h18v2H10zM10 15h18v2H10zM10 24h18v2H10zM4 5h4v4H4zM4 14h4v4H4zM4 23h4v4H4z" />
          </svg>
          Curriculum objective · {objective}
        </span>
      ) : null}
      {source ? (
        <span className={chip}>
          <svg viewBox="0 0 32 32" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M25.7 9.3l-7-7A1 1 0 0 0 18 2H8a2 2 0 0 0-2 2v24a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V10a1 1 0 0 0-.3-.7zM18 4.4l5.6 5.6H18zM24 28H8V4h8v6a2 2 0 0 0 2 2h6z" />
          </svg>
          {source.textbook}
          {source.chapter ? ` · ${source.chapter}` : ""}
        </span>
      ) : null}
    </div>
  );
}
