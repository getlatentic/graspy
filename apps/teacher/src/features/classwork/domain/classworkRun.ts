import type { ClassworkWorkspaceSnapshot } from "./classwork";

/**
 * Whether work is going on right now.
 *
 * A run that has stopped leaves its unstarted sections `pending`, so reading
 * the sections alone said a failed run was still working: the retry the failed
 * section offers was withheld — "waiting for the work already running" — and
 * the poll behind it never stopped. A run is only working while it says it is.
 */
export function generationActive(snapshot: ClassworkWorkspaceSnapshot): boolean {
  const run = snapshot.run;
  if (!run) return false;
  if (run.sectionRegeneration?.status === "generating") return true;
  return (
    run.status === "running" &&
    run.sections.some(({ status }) => status === "generating" || status === "pending")
  );
}
