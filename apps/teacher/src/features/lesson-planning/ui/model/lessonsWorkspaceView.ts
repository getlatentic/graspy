/**
 * Which of the lessons workspace's screens is on: still reading, unable to
 * read, writing a lesson in place of the week, or the week itself.
 */
export type LessonsWorkspaceView = "loading" | "failed" | "writing" | "week";

/**
 * The workspace's one decision, in the order that settles it.
 *
 * Nothing can show before the store has answered, and a store that answered
 * with a failure has nothing to write against. Writing a lesson replaces the
 * week rather than sitting inside it — a teacher composing one thing is not
 * reading it beside its neighbours — so it wins over the week whenever a way
 * of writing is open.
 */
export function lessonsWorkspaceView(
  status: "loading" | "failed" | "ready",
  writingOpen: boolean,
): LessonsWorkspaceView {
  if (status === "loading") return "loading";
  if (status === "failed") return "failed";
  return writingOpen ? "writing" : "week";
}
