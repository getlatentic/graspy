import { TEACHER } from "../lib/teacher";

/** Who is teaching: her name as the page's heading, the language under it. */
export function TeacherHeader({ language }: { language: string }) {
  return (
    <header className="flex items-center gap-4">
      <span
        aria-hidden="true"
        className="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent font-display text-2xl font-semibold text-on-accent"
      >
        {TEACHER.initial}
      </span>
      <div className="min-w-0">
        <h1 className="break-words font-display text-2xl font-semibold text-ink">
          {TEACHER.name}
        </h1>
        <p className="text-muted">{language}</p>
      </div>
    </header>
  );
}
