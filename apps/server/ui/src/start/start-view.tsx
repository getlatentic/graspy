import { ArrowRight, LoaderCircle } from "lucide-react";
import { isStartLesson, type StartLesson } from "@/lib/content";
import { buttonStyles } from "@/lesson/button-styles";
import { useToolResult, type Shown } from "@/shared/use-tool-result";
import { fill } from "@/shared/words";
import { useStart } from "./use-start";

export function StartView() {
  const shown = useToolResult("graspy start", (value) =>
    isStartLesson(value) ? value : null,
  );
  return shown && <Start shown={shown} />;
}

function Start({ shown }: { shown: Shown<StartLesson> }) {
  const { app, result, words } = shown;
  const start = result.structuredContent;
  const { made, tryAgain, open } = useStart(app, start);

  return (
    <section
      aria-label={words.start.label}
      className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4"
    >
      {made.status === "ready" && (
        <button
          type="button"
          onClick={() => void open()}
          className={buttonStyles("primary")}
        >
          <span dir="auto">
            {fill(words.start.open, { topic: start.topic })}
          </span>
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </button>
      )}
      {made.status === "making" && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle
            className="size-4 motion-safe:animate-spin"
            aria-hidden="true"
          />
          {words.start.making}
        </p>
      )}
      {made.status === "failed" && (
        <>
          <p role="alert" className="text-sm text-ink">
            {words.start.failed}
          </p>
          <button
            type="button"
            onClick={() => void tryAgain()}
            className={buttonStyles("secondary")}
          >
            {words.start.tryAgain}
          </button>
        </>
      )}
    </section>
  );
}
