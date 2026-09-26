import { vi } from "vitest";
import { LEARNER } from "@/lib/voice/voice-worker.fake";
import {
  lessonReducer,
  START,
  type LessonEvent,
  type LessonState,
  type Phase,
} from "./lesson-state";

// For the lesson's tests, which mock the session and the API's address before these load.

/** The app as a reload leaves it: fresh modules over the same IndexedDB. */
export async function reload() {
  vi.resetModules();
  return {
    ...(await import("@/lib/voice/answer-store")),
    ...(await import("@/lib/voice/answer-outbox")),
    ...(await import("./lesson-steps")),
    ...(await import("./follow-answer")),
  };
}
export type App = Awaited<ReturnType<typeof reload>>;

export const noPause = async () => {};
/** The lesson's retry, not due while a test runs. */
export const notYet = () => new Promise(() => {});

/** The lesson page from the child's Start tap: every phase it shows, in order. */
export function lessonPage(app: App, plan?: string) {
  let state: LessonState = lessonReducer(START, { type: "start" });
  const shown: Phase[] = [];
  const emit = (event: LessonEvent) => {
    state = lessonReducer(state, event);
    shown.push(state.phase);
  };
  const leaving = new AbortController();
  return {
    shown,
    get state() {
      return state;
    },
    leave: () => leaving.abort(),
    async open() {
      emit(await app.openingStep(LEARNER, plan));
    },
    /** What the page does while an answer is on screen: follows it to its outcome. */
    follow(retry: () => Promise<unknown> = notYet) {
      const { phase } = state;
      if (phase.name !== "checking")
        throw new Error(`no answer: ${phase.name}`);
      return app.followAnswer(phase.key, emit, leaving.signal, retry);
    },
    /** The child carries on past the answer kept on screen, which the page then stops following. */
    async carryOn(due: () => Promise<unknown> = notYet) {
      const { phase } = state;
      if (phase.name !== "kept") throw new Error(`nothing kept: ${phase.name}`);
      await app.carryOn(phase.key, LEARNER.key, emit, undefined, due);
      leaving.abort();
    },
    /** The lesson asks the server for its next step. */
    async next() {
      const { phase } = state;
      if (phase.name !== "moving-on") throw new Error(`stuck: ${phase.name}`);
      emit(await app.nextStep(phase, LEARNER, plan, noPause));
    },
    /** Her reply said, the lesson moves on to what the server gives next. */
    async moveOn() {
      emit({ type: "replied" });
      await this.next();
    },
  };
}

export const names = (phases: Phase[]) => phases.map((phase) => phase.name);

export function deadlines() {
  const given: AbortController[] = [];
  vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
    const deadline = new AbortController();
    given.push(deadline);
    return deadline.signal;
  });
  return () =>
    given.forEach((deadline) =>
      deadline.abort(new DOMException("timed out", "TimeoutError")),
    );
}
