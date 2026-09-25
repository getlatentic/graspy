import type { App } from "@modelcontextprotocol/ext-apps";
import type { ToolResult } from "@/lib/content";
import { lessonViewOf, type LessonView as Content } from "@/lib/lesson";
import { useToolResult } from "@/shared/use-tool-result";
import { fill, type LessonWords } from "@/shared/words";
import { buttonStyles } from "./button-styles";
import { Slide } from "./slide";
import { useLessonStage } from "./stage";
import { useLesson } from "./use-lesson";
import { useLessonRecord } from "./use-lesson-record";
import { useSlidePlace } from "./use-slide-place";

export function LessonView() {
  const shown = useToolResult("graspy lesson", lessonViewOf);
  if (!shown) return null;
  return (
    <Lesson app={shown.app} opened={shown.result} words={shown.words.lesson} />
  );
}

function Lesson({
  app,
  opened,
  words,
}: {
  app: App;
  opened: ToolResult<Content>;
  words: LessonWords;
}) {
  const { view, askAgain } = useLesson(app, opened.structuredContent);
  const stage = useLessonStage(view);
  const onAskAgain = () => void askAgain();

  let body;
  if (stage === "slides" && view.lesson?.slides.length) {
    body = (
      <Slides
        app={app}
        content={view}
        viewUUID={opened._meta.viewUUID}
        words={words}
        onAskAgain={onAskAgain}
      />
    );
  } else if (stage === "failed") {
    body = <Failed words={words} onAskAgain={onAskAgain} />;
  } else {
    body = <Making content={view} words={words} />;
  }

  return (
    <section aria-label={words.label} className="space-y-6 p-1">
      <Header content={view} words={words} />
      {body}
    </section>
  );
}

function Header({ content, words }: { content: Content; words: LessonWords }) {
  const { target } = content;
  const topics = Math.max(target.totalTopics, 1);
  return (
    <header>
      <p className="text-sm font-medium text-accent-ink">{target.subject}</p>
      <h1
        dir="auto"
        className="mt-1 text-balance text-2xl font-semibold text-ink"
      >
        {content.lesson?.title || target.topic}
      </h1>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-track">
          <div
            className="h-1.5 rounded-full bg-accent"
            style={{ width: `${((target.topicIndex + 1) / topics) * 100}%` }}
          />
        </div>
        <span className="nums shrink-0 text-xs text-muted">
          {fill(words.topicOf, {
            current: String(target.topicIndex + 1),
            total: String(topics),
          })}
        </span>
      </div>
    </header>
  );
}

function Slides({
  app,
  content,
  viewUUID,
  words,
  onAskAgain,
}: {
  app: App;
  content: Content;
  viewUUID: string;
  words: LessonWords;
  onAskAgain: () => void;
}) {
  const slides = content.lesson?.slides ?? [];
  const place = useSlidePlace(
    viewUUID,
    slides.length,
    content.status === "making",
  );
  const record = useLessonRecord(app, content.target, viewUUID);
  return (
    <>
      <Slide
        key={place.index}
        slide={slides[place.index]}
        place={place}
        words={words}
        record={record}
      />
      <Arrival content={content} words={words} onAskAgain={onAskAgain} />
    </>
  );
}

function Making({ content, words }: { content: Content; words: LessonWords }) {
  return (
    <>
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-10 text-center motion-safe:animate-enter"
      >
        <span className="inline-block size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <h2 className="text-lg font-semibold text-ink">{words.loading}</h2>
        <p dir="auto" className="text-muted">
          {content.target.topic}
        </p>
      </div>
      <Objectives objectives={content.lesson?.objectives ?? []} words={words} />
    </>
  );
}

function Objectives({
  objectives,
  words,
}: {
  objectives: string[];
  words: LessonWords;
}) {
  if (objectives.length === 0) return null;
  return (
    <section
      aria-label={words.objectives}
      className="rounded-card border border-line bg-surface p-4 motion-safe:animate-enter"
    >
      <h2 className="text-sm font-semibold text-ink">{words.objectives}</h2>
      <ul
        dir="auto"
        className="mt-2 list-disc space-y-1 ps-5 text-sm text-muted"
      >
        {objectives.map((objective) => (
          <li key={objective}>{objective}</li>
        ))}
      </ul>
    </section>
  );
}

function Failed({
  words,
  onAskAgain,
}: {
  words: LessonWords;
  onAskAgain: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-card border border-line bg-surface p-6 motion-safe:animate-enter"
    >
      <h2 className="text-lg font-semibold text-ink">{words.loadFailed}</h2>
      <p className="mt-2 leading-7 text-muted">{words.failed}</p>
      <button
        type="button"
        onClick={onAskAgain}
        className={`${buttonStyles("primary")} mt-5`}
      >
        {words.tryAgain}
      </button>
    </div>
  );
}

function Arrival({
  content,
  words,
  onAskAgain,
}: {
  content: Content;
  words: LessonWords;
  onAskAgain: () => void;
}) {
  if (content.status === "making") {
    return (
      <p role="status" className="text-center text-sm text-muted">
        {words.arriving}
      </p>
    );
  }
  if (content.whole) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-warning-soft p-4 text-sm text-ink motion-safe:animate-enter">
      <p>{words.partial}</p>
      <button
        type="button"
        onClick={onAskAgain}
        className={buttonStyles("secondary", "sm")}
      >
        {words.tryAgain}
      </button>
    </div>
  );
}
