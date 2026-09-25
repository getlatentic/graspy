/**
 * Every code graspy reports at startup, plus `startup-check-unavailable`, which
 * only this side can observe: if asking whether graspy started fails, the
 * workspace must not open, because an unanswered question is not a healthy one.
 */
export type LaunchFailureCode =
  | "needs-app-update"
  | "lesson-library-unavailable"
  | "interrupted-work-unresolved"
  | "source-material-unavailable"
  | "included-content-unavailable"
  | "startup-check-unavailable";

export interface LaunchFailure {
  readonly code: LaunchFailureCode;
  readonly detail: string;
}

export interface LaunchFailureDescription {
  readonly title: string;
  readonly explanation: string;
  readonly recovery: string;
  /** A newer lesson library is resolved by updating, so retrying cannot help. */
  readonly retryable: boolean;
  /**
   * Whether the workspace is unusable. The included curriculum is additive, so
   * a teacher whose lessons come from their own goals keeps working and is told
   * what is missing; everything else leaves nothing safe to open.
   */
  readonly blocksWorkspace: boolean;
}

const DESCRIPTIONS: Record<LaunchFailureCode, LaunchFailureDescription> = {
  "needs-app-update": {
    title: "Update graspy to open your lessons",
    explanation:
      "Your lessons were saved by a newer version of graspy. This version cannot open them without risking your work.",
    recovery: "Install the latest version of graspy, then open it again.",
    retryable: false,
    blocksWorkspace: true,
  },
  "lesson-library-unavailable": {
    title: "graspy cannot open your saved lessons",
    explanation:
      "Your lessons are stored on this computer, and graspy could not open that storage.",
    recovery:
      "Close any other copy of graspy that is open, then try again. If it keeps happening, send the details below to your support contact.",
    retryable: true,
    blocksWorkspace: true,
  },
  "interrupted-work-unresolved": {
    title: "graspy could not settle unfinished work",
    explanation:
      "A lesson that was still being prepared when graspy last closed could not be tidied up.",
    recovery:
      "Try again. If it keeps happening, send the details below to your support contact.",
    retryable: true,
    blocksWorkspace: true,
  },
  "source-material-unavailable": {
    title: "The included source material could not be opened",
    explanation:
      "graspy builds lessons from source material installed alongside it, and that material is missing or unreadable.",
    recovery: "Reinstall graspy, then open it again.",
    retryable: true,
    blocksWorkspace: true,
  },
  "included-content-unavailable": {
    title: "The included curriculum could not be added",
    explanation:
      "graspy could not add the curriculum and termly plans that come with it. Lessons you write yourself are unaffected.",
    recovery:
      "Try again. If it keeps happening, reinstall graspy to restore the included curriculum.",
    retryable: true,
    blocksWorkspace: false,
  },
  "startup-check-unavailable": {
    title: "graspy could not confirm it opened correctly",
    explanation:
      "graspy checks that everything it needs is ready before showing your lessons, and that check did not answer.",
    recovery:
      "Close graspy and open it again. If it keeps happening, send the details below to your support contact.",
    retryable: true,
    blocksWorkspace: true,
  },
};

export function describeLaunchFailure(
  failure: LaunchFailure,
): LaunchFailureDescription {
  return DESCRIPTIONS[failure.code];
}
