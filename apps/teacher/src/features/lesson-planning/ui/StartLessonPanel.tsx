import { LessonStartRoutes } from "./LessonStartRoutes";
import { eyebrow } from "../../../ui/chrome";

/**
 * What a teacher meets when a class is open but no lesson is chosen.
 *
 * The scheme's own weeks are listed beside this as lessons already, planned or
 * not, so this is not where a teacher picks one of those up. It is the way to
 * begin a lesson the scheme does not hold — write it, let graspy draft it, or
 * bring a plan they already have.
 */
export function StartLessonPanel({
  onStartBlank,
  onDraftWithGraspy,
  onBringYourOwn,
}: {
  readonly onStartBlank: () => void;
  readonly onDraftWithGraspy: () => void;
  readonly onBringYourOwn: () => void;
}) {
  return (
    // The cards below want the pane's width; capping the whole panel at 34rem
    // squeezed three of them into a third of that each, so every title wrapped
    // and the space around them stayed empty.
    <div className="grid content-start gap-md p-xl">
      <p className={eyebrow}>Today</p>
      <h2 className="m-0 font-display text-xl font-extrabold leading-heading tracking-[-0.035em] text-ink">Start a lesson</h2>
      <p className="m-0 max-w-[60ch] leading-body text-ink-secondary">
        Pick a lesson from your week beside this, or start one your scheme does
        not hold — write it yourself, let graspy draft it, or bring a plan you
        already have.
      </p>

      <LessonStartRoutes
        onStartBlank={onStartBlank}
        onDraftWithGraspy={onDraftWithGraspy}
        onBringYourOwn={onBringYourOwn}
      />
    </div>
  );
}
