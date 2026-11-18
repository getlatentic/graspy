import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TEACHER } from "../lib/teacher";
import { TeacherAvatar } from "./teacher-avatar";

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
      <TeacherAvatar speaking={speaking} className="size-14" />
      <div className="min-w-0">
        <p className="font-semibold text-ink">{TEACHER.name}</p>
        {detail && <p className="text-sm text-muted">{detail}</p>}
      </div>
    </div>
  );
}
