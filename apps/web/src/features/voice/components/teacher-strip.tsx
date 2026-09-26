import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TEACHER } from "../lib/teacher";

/** Who is teaching, said once, so no lesson row has to repeat it. */
export function TeacherStrip({
  detail,
  speaking = false,
  className,
}: {
  detail?: ReactNode;
  speaking?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full bg-accent font-display text-lg font-semibold text-on-accent",
          speaking && "ring-4 ring-accent-line motion-safe:animate-pulse",
        )}
      >
        {TEACHER.initial}
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{TEACHER.name}</p>
        {detail && <p className="text-sm text-muted">{detail}</p>}
      </div>
    </div>
  );
}
