import { cn } from "@/lib/cn";

type Standing = "learnt" | "started" | "not-yet";

const TOPICS: Array<{ title: string; standing: Standing }> = [
  { title: "Number systems", standing: "learnt" },
  { title: "Adding and subtracting", standing: "learnt" },
  { title: "Fractions and decimals", standing: "started" },
  { title: "Times tables", standing: "not-yet" },
];

const STANDING: Record<Standing, { label: string; className: string }> = {
  learnt: { label: "Learnt", className: "bg-warning-soft text-warning" },
  started: { label: "Started", className: "bg-accent-soft text-accent-ink" },
  "not-yet": { label: "Not yet", className: "bg-track text-muted" },
};

/** Laid out as the mobile app draws it. */
export function LessonPreview({ className }: { className?: string }) {
  return (
    <figure
      className={cn("rounded-3xl bg-canvas p-5 sm:p-7", className)}
      aria-label="A subject's lessons in graspy, with the tutor answering a question"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-accent-ink">
        Mathematics · JSS 1
      </p>
      <p className="mt-1 font-display text-lg font-semibold text-ink">
        Your lessons
      </p>

      <ul className="mt-4 space-y-2">
        {TOPICS.map((topic) => {
          const standing = STANDING[topic.standing];
          return (
            <li
              key={topic.title}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3",
                topic.standing === "started" && "ring-1 ring-accent-line",
              )}
            >
              <span className="truncate text-sm font-medium text-ink">
                {topic.title}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  standing.className,
                )}
              >
                {standing.label}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 space-y-2 text-sm leading-6">
        <p className="ms-auto w-fit max-w-5/6 rounded-2xl rounded-ee-sm border border-accent-line bg-accent-soft px-4 py-2 text-ink">
          Why is 0.5 the same as a half?
        </p>
        <p className="w-fit max-w-9/10 rounded-2xl rounded-es-sm bg-surface px-4 py-2 text-ink">
          Cut an orange into 10 equal pieces and take 5. That is half the
          orange, and 5 tenths is written 0.5.
        </p>
      </div>
    </figure>
  );
}
