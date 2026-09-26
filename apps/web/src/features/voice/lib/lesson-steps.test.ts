import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  answerTo,
  ASKED,
  holdMarking,
  KEPT,
  LEARNER,
  NEXT,
  OTHER,
  resetServer,
  respond,
  sent,
  server,
  turnOf,
} from "@/lib/voice/voice-worker.fake";
import {
  lessonReducer,
  START,
  type LessonEvent,
  type LessonState,
  type Phase,
} from "./lesson-state";

vi.mock("@/lib/api/session", () => ({ fetchWithSession: respond }));
vi.mock("@/lib/env", () => ({ API_BASE_URL: "https://api.test/api" }));

/** The app as a reload leaves it: fresh modules over the same IndexedDB. */
async function reload() {
  vi.resetModules();
  return {
    ...(await import("@/lib/voice/answer-store")),
    ...(await import("@/lib/voice/answer-outbox")),
    ...(await import("./lesson-steps")),
    ...(await import("./follow-answer")),
  };
}
type App = Awaited<ReturnType<typeof reload>>;

const noPause = async () => {};
/** The lesson's retry, not due while a test runs. */
const notYet = () => new Promise(() => {});

/** The lesson page from the child's Start tap: every phase it shows, in order. */
function lessonPage(app: App, plan?: string) {
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
    async carryOn() {
      const { phase } = state;
      if (phase.name !== "kept") throw new Error(`nothing kept: ${phase.name}`);
      await app.carryOn(phase.key, emit);
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

const names = (phases: Phase[]) => phases.map((phase) => phase.name);

beforeEach(async () => {
  resetServer();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  // The page recorded an answer, kept it, and was reloaded before it was marked.
  const before = await reload();
  await before.keepAnswer(KEPT);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock("@/lib/voice/answer-store");
});

describe("a voice lesson reloaded with an answer kept", () => {
  it("shows the answer being checked, then its result, then the next question, asking nothing twice", async () => {
    const release = holdMarking();
    const app = await reload();
    const background = app.sendKeptAnswers(LEARNER.key);
    const page = lessonPage(app);

    await page.open();
    expect(page.state.phase).toEqual({
      name: "checking",
      move: ASKED,
      key: "key-1",
    });
    const following = page.follow();
    release();
    await Promise.all([background, following]);
    expect(page.state.phase).toMatchObject({
      name: "result",
      move: ASKED,
      turn: turnOf("gvm_key-1"),
    });

    await page.moveOn();
    expect(page.state.phase).toEqual({ name: "teaching", move: NEXT });
    expect(sent("POST /api/voice/samples")).toHaveLength(1);
    expect(sent("GET /api/voice/lesson")).toHaveLength(1);
  });

  it("shows the result of an answer marked before the lesson started, from the device", async () => {
    const app = await reload();
    await app.sendKeptAnswers(LEARNER.key);
    server.asked = [];
    const page = lessonPage(app);

    await page.open();
    await page.follow();
    expect(names(page.shown)).toEqual(["checking", "result"]);
    expect(server.asked).toEqual([]);
  });

  it("shows the answer kept while the server cannot be reached, and its result once it can", async () => {
    server.reachable = false;
    const app = await reload();
    const page = lessonPage(app);

    await page.open();
    const following = page.follow();
    await vi.waitFor(() => expect(page.state.phase.name).toBe("kept"));

    server.reachable = true;
    await app.sendKeptAnswers(LEARNER.key);
    await following;
    expect(names(page.shown)).toEqual(["checking", "kept", "result"]);
  });

  it("tries the kept answer again while it is on screen, when the server was only busy", async () => {
    server.busy = 1;
    const page = lessonPage(await reload());

    await page.open();
    await page.follow(noPause);
    expect(names(page.shown)).toEqual(["checking", "kept", "result"]);
  });

  it("shows a refusal as it would have: the question again, and why", async () => {
    server.refusal = { status: 422, code: "no_speech" };
    const page = lessonPage(await reload());

    await page.open();
    await page.follow();
    expect(page.state).toEqual({
      phase: { name: "your-turn", move: ASKED },
      note: "noSpeech",
    });
  });

  it("lets the answer go once its outcome is shown, so the next start is the teacher's step", async () => {
    const page = lessonPage(await reload());
    await page.open();
    await page.follow();

    const app = await reload();
    expect(await app.unseenAnswer(LEARNER.key, undefined)).toBeNull();
    const next = lessonPage(app);
    await next.open();
    expect(next.state.phase).toEqual({ name: "teaching", move: NEXT });
  });

  it("keeps the outcome for the next start when the lesson is left before it arrives", async () => {
    const release = holdMarking();
    const app = await reload();
    const page = lessonPage(app);
    await page.open();
    const following = page.follow();
    page.leave();
    release();
    await following;
    await app.sendKeptAnswers(LEARNER.key);
    expect(names(page.shown)).toEqual(["checking"]);

    const again = lessonPage(await reload());
    await again.open();
    await again.follow();
    expect(again.state.phase.name).toBe("result");
  });

  it("shows nothing more once the lesson is left while the server cannot be reached", async () => {
    server.reachable = false;
    const page = lessonPage(await reload());
    await page.open();
    const following = page.follow();
    page.leave();
    await following;
    expect(names(page.shown)).toEqual(["checking"]);
  });

  it("sends nothing when its retry comes due after the lesson is left", async () => {
    server.reachable = false;
    const page = lessonPage(await reload());
    await page.open();
    let due = () => {};
    const retry = () => new Promise<void>((resolve) => (due = resolve));
    const following = page.follow(retry);
    await vi.waitFor(() => expect(page.state.phase.name).toBe("kept"));

    page.leave();
    server.reachable = true;
    due();
    await following;
    expect(server.asked).toEqual([]);
  });

  it("opens with no lesson chosen on an unseen answer to any lesson", async () => {
    const app = await reload();
    await app.forgetAnswer("key-1");
    await app.keepAnswer(answerTo(OTHER, "key-2", 2));
    const page = lessonPage(app);
    await page.open();
    expect(page.state.phase).toEqual({
      name: "checking",
      move: OTHER,
      key: "key-2",
    });
  });

  it("opens another lesson at its own step, leaving the answer to its lesson", async () => {
    const app = await reload();
    const page = lessonPage(app, OTHER.plan_id);
    await page.open();
    expect(page.state.phase).toEqual({ name: "teaching", move: OTHER });
    expect(await app.unseenAnswer(LEARNER.key, ASKED.plan_id)).toEqual({
      key: "key-1",
      move: ASKED,
    });
  });
});

describe("a lesson on a device whose storage cannot be opened", () => {
  it("opens on the teacher's step", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new DOMException("denied", "InvalidStateError");
      },
    });
    const page = lessonPage(await reload());
    await page.open();
    expect(page.state.phase).toEqual({ name: "teaching", move: ASKED });
    expect(warn).toHaveBeenCalled();
  });
});

/** Every request's time limit, to be run out by the test rather than the clock. */
function deadlines() {
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

describe("an answer whose marking never answers", () => {
  it("shows as kept once the request is given up, and is sent again on the next try", async () => {
    server.hung = 1;
    const runOut = deadlines();
    const page = lessonPage(await reload());
    await page.open();
    let due = () => {};
    const retry = () => new Promise<void>((resolve) => (due = resolve));
    const following = page.follow(retry);
    const marking = "POST /api/voice/samples/gvm_key-1/evaluation";
    await vi.waitFor(() => expect(sent(marking)).toHaveLength(1));

    runOut();
    await vi.waitFor(() => expect(page.state.phase.name).toBe("kept"));
    due();
    await following;
    expect(page.state.phase).toMatchObject({
      name: "result",
      turn: turnOf("gvm_key-1"),
    });
    expect(sent(marking)).toHaveLength(2);
  });
});

describe("an answer the child carries on past", () => {
  async function keptOnScreen() {
    server.busy = 1;
    const app = await reload();
    const page = lessonPage(app);
    await page.open();
    void page.follow();
    await vi.waitFor(() => expect(page.state.phase.name).toBe("kept"));
    return { app, page };
  }

  it("moves on to the teacher's step, is still sent, and is never shown", async () => {
    const { page } = await keptOnScreen();
    await page.carryOn();
    expect(page.state.phase).toEqual({
      name: "moving-on",
      move: ASKED,
      heard: false,
    });
    await page.next();
    expect(page.state.phase).toEqual({ name: "teaching", move: ASKED });

    const app = await reload();
    expect(await app.unseenAnswer(LEARNER.key, undefined)).toBeNull();
    await app.sendKeptAnswers(LEARNER.key);
    expect(sent("POST /api/voice/samples/gvm_key-1/evaluation")).toHaveLength(
      2,
    );
    expect(await app.keptAnswers(LEARNER.key)).toEqual([]);
    expect(await app.settledOf("key-1")).toBeNull();
  });

  it("never shows the outcome of a send under way when it lands", async () => {
    const { app, page } = await keptOnScreen();
    const release = holdMarking();
    const background = app.sendKeptAnswers(LEARNER.key);
    await vi.waitFor(() =>
      expect(sent("POST /api/voice/samples/gvm_key-1/evaluation")).toHaveLength(
        2,
      ),
    );
    await page.carryOn();
    release();
    await background;

    expect(server.marked.has("gvm_key-1")).toBe(true);
    expect(await app.unseenAnswer(LEARNER.key, undefined)).toBeNull();
    expect(await app.settledOf("key-1")).toBeNull();
  });
});

describe("an answer whose outcome the device could not store", () => {
  it("stays on screen as kept, and shows its result on the next try", async () => {
    vi.doMock("@/lib/voice/answer-store", async (actual) => {
      const store = await actual<typeof import("@/lib/voice/answer-store")>();
      let refused = false;
      return {
        ...store,
        settleAnswer: (...args: Parameters<typeof store.settleAnswer>) => {
          if (refused) return store.settleAnswer(...args);
          refused = true;
          return Promise.reject(
            new DOMException("closed", "InvalidStateError"),
          );
        },
      };
    });
    const page = lessonPage(await reload());
    await page.open();
    let due = () => {};
    const retry = () => new Promise<void>((resolve) => (due = resolve));
    const following = page.follow(retry);
    await vi.waitFor(() => expect(page.state.phase.name).toBe("kept"));

    due();
    await following;
    expect(page.state.phase).toMatchObject({
      name: "result",
      move: ASKED,
      turn: turnOf("gvm_key-1"),
    });
  });
});

describe("an answer kept on screen while another tab sends it", () => {
  async function keptOnScreen() {
    server.reachable = false;
    const page = lessonPage(await reload());
    await page.open();
    let due = () => {};
    const retry = () => new Promise<void>((resolve) => (due = resolve));
    const following = page.follow(retry);
    await vi.waitFor(() => expect(page.state.phase.name).toBe("kept"));
    server.reachable = true;
    const otherTab = await reload();
    await otherTab.sendKeptAnswers(LEARNER.key);
    return { page, otherTab, retryNow: () => (due(), following) };
  }

  it("shows the result that tab got, from the device", async () => {
    const { page, retryNow } = await keptOnScreen();
    await retryNow();
    expect(page.state.phase).toMatchObject({
      name: "result",
      move: ASKED,
      turn: turnOf("gvm_key-1"),
    });
    expect(sent("POST /api/voice/samples")).toHaveLength(1);
  });

  it("moves on once that tab has shown it and let it go", async () => {
    const { page, otherTab, retryNow } = await keptOnScreen();
    await otherTab.forgetAnswer("key-1");
    await retryNow();
    expect(page.state.phase).toEqual({
      name: "moving-on",
      move: ASKED,
      heard: false,
    });
    await page.moveOn();
    expect(page.state.phase).toEqual({ name: "teaching", move: NEXT });
  });
});

describe("an answer recorded in the lesson", () => {
  it("is sent at once, not behind an earlier one still being marked", async () => {
    const release = holdMarking();
    const app = await reload();
    const background = app.sendKeptAnswers(LEARNER.key);
    await app.keepAnswer(answerTo(OTHER, "key-2", 2));

    const emit: LessonEvent[] = [];
    await app.followAnswer(
      "key-2",
      (event) => emit.push(event),
      new AbortController().signal,
      notYet,
    );
    expect(emit).toEqual([
      {
        type: "settled",
        key: "key-2",
        sent: { kind: "marked", turn: turnOf("gvm_key-2") },
      },
    ]);
    release();
    await background;
  });
});
