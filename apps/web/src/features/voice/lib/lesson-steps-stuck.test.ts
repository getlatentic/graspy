import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASKED,
  holdMarking,
  KEPT,
  LEARNER,
  resetServer,
  respond,
  sent,
  server,
  turnOf,
} from "@/lib/voice/voice-worker.fake";
import { type LessonEvent } from "./lesson-state";

import {
  deadlines,
  lessonPage,
  noPause,
  notYet,
  reload,
} from "./lesson-page.fake";

vi.mock("@/lib/api/session", () => ({ fetchWithSession: respond }));
vi.mock("@/lib/env", () => ({ API_BASE_URL: "https://api.test/api" }));

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
describe("an answer whose marking never answers", () => {
  it("shows as kept, with the way on, once the retry comes due while the first try hangs", async () => {
    server.hung = 1;
    const runOut = deadlines();
    const page = lessonPage(await reload());
    await page.open();
    let due = () => {};
    const retry = () => new Promise<void>((resolve) => (due = resolve));
    const following = page.follow(retry);
    const marking = "POST /api/voice/samples/gvm_key-1/evaluation";
    await vi.waitFor(() => expect(sent(marking)).toHaveLength(1));

    due();
    await vi.waitFor(() => expect(page.state.phase.name).toBe("kept"));
    expect(sent(marking)).toHaveLength(1);
    runOut();
    // Each try joins the first until it has given up; the one after sends again.
    await vi.waitFor(() => {
      due();
      expect(sent(marking)).toHaveLength(2);
    });
    await following;
    expect(page.state.phase).toMatchObject({
      name: "result",
      turn: turnOf("gvm_key-1"),
    });
  });

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

  it("is sent again once the retry is due, while the device stays online", async () => {
    const { page } = await keptOnScreen();
    await page.carryOn(async () => {});
    await vi.waitFor(() => expect(server.marked.has("gvm_key-1")).toBe(true));
    expect(sent("POST /api/voice/samples/gvm_key-1/evaluation")).toHaveLength(
      2,
    );
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

describe("carrying on while storage never answers", () => {
  it("still moves the lesson on", async () => {
    vi.doMock("@/lib/voice/answer-store", async (actual) => ({
      ...(await actual<typeof import("@/lib/voice/answer-store")>()),
      passOver: () => new Promise(() => {}),
    }));
    const events: LessonEvent[] = [];
    const app = await reload();
    await app.carryOn(
      "key-1",
      LEARNER.key,
      (event) => events.push(event),
      noPause,
      notYet,
    );
    expect(events).toEqual([{ type: "carriedOn", key: "key-1" }]);
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

describe("a lesson opened on storage that never answers", () => {
  it("opens on the teacher's step", async () => {
    vi.doMock("@/lib/voice/answer-store", async (actual) => ({
      ...(await actual<typeof import("@/lib/voice/answer-store")>()),
      unseenAnswer: () => new Promise(() => {}),
    }));
    const app = await reload();
    expect(await app.openingStep(LEARNER, undefined, noPause)).toEqual({
      type: "loaded",
      move: ASKED,
    });
  });
});
