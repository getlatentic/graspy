/**
 * Which of the scheme workspace's screens is on: still reading, unable to
 * read, choosing a scheme to start from, or planning the one it has.
 */
export type SchemeWorkspaceView = "loading" | "failed" | "start" | "planner";

/**
 * The workspace's one decision, in the order that settles it.
 *
 * Nothing shows before the store has answered, and a store that answered with
 * a failure has no scheme to report on either way. After that the question is
 * simply whether this class and term have a scheme yet: without one there is
 * nothing to plan, only a way to begin.
 */
export function schemeWorkspaceView(
  status: "loading" | "failed" | "ready",
  hasScheme: boolean,
): SchemeWorkspaceView {
  if (status === "loading") return "loading";
  if (status === "failed") return "failed";
  return hasScheme ? "planner" : "start";
}
