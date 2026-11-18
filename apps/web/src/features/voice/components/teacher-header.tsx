import { TEACHER } from "../lib/teacher";
import { TeacherAvatar } from "./teacher-avatar";

/** Who is teaching: her name as the page's heading, the language under it. */
export function TeacherHeader({ language }: { language: string }) {
  return (
    <header className="flex items-center gap-4">
      <TeacherAvatar className="size-20" />
      <div className="min-w-0">
        <h1 className="break-words font-display text-2xl font-semibold text-ink">
          {TEACHER.name}
        </h1>
        <p className="text-muted">{language}</p>
      </div>
    </header>
  );
}
