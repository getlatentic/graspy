import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  answerTo,
  ASKED,
  holdMarking,
  KEPT,
  LEARNER,
  OTHER,
  resetServer,
  respond,
  sent,
  server,
} from "./voice-worker.fake";

vi.mock("@/lib/api/session", () => ({ fetchWithSession: respond }));
vi.mock("@/lib/env", () => ({ API_BASE_URL: "https://api.test/api" }));
// Whom the device learns as; a test may switch it.
const device = vi.hoisted(() => ({ learner: "device/abc" }));
vi.mock("@/lib/voice/voice-learner-key", () => ({
  voiceLearnerKey: () => device.learner,
}));

// A fresh module per load: the app keeps one IndexedDB connection for the tab's lifetime.
async function load() {
  vi.resetModules();
  return {
    ...(await import("./answer-store")),
    ...(await import("./answer-outbox")),
    ...(await import("@/lib/idb")),
  };
}

beforeEach(() => {
  resetServer();
  device.learner = LEARNER.key;
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
});

afterEach(() => vi.unstubAllGlobals());

describe("the answers kept on the device", () => {
  it("send one answer once, however many ask for it", async () => {
    const app = await load();
    await app.keepAnswer(KEPT);
    const release = holdMarking();
    const asks = [app.sendKept("key-1"), app.sendKeptAnswers(LEARNER.key)];
    release();
    await Promise.all(asks);
    expect(sent("POST /api/voice/samples")).toHaveLength(1);
    expect(sent("POST /api/voice/samples/gvm_key-1/evaluation")).toHaveLength(
      1,
    );
    expect(await app.settledOf("key-1")).toMatchObject({ kind: "marked" });
  });

  it("never send an answer again once its outcome has been shown and let go", async () => {
    const app = await load();
    await app.keepAnswer(answerTo(OTHER, "key-0", 0));
    await app.keepAnswer(KEPT);
    const release = holdMarking("gvm_key-0");
    const background = app.sendKeptAnswers(LEARNER.key);
    await vi.waitFor(() =>
      expect(sent("POST /api/voice/samples/gvm_key-0/evaluation")).toHaveLength(
        1,
      ),
    );

    await expect(app.sendKept("key-1")).resolves.toMatchObject({
      kind: "marked",
    });
    await app.forgetAnswer("key-1");
    release();
    await background;

    expect(sent("POST /api/voice/samples/gvm_key-1/evaluation")).toHaveLength(
      1,
    );
    expect(await app.settledOf("key-1")).toBeNull();
  });

  it("never write an outcome back once another tab has shown it and let it go", async () => {
    const tabB = await load();
    await tabB.keepAnswer(KEPT);
    const tabA = await load();
    const releaseB = holdMarking();
    const b = tabB.sendKept("key-1");
    await vi.waitFor(() =>
      expect(sent("POST /api/voice/samples/gvm_key-1/evaluation")).toHaveLength(
        1,
      ),
    );

    // Tab A's marking is not held: it lands first, and its lesson shows it and lets it go.
    server.held.delete("gvm_key-1");
    await expect(tabA.sendKept("key-1")).resolves.toMatchObject({
      kind: "marked",
    });
    await tabA.forgetAnswer("key-1");
    releaseB();
    await b;

    expect(await tabA.settledOf("key-1")).toBeNull();
    expect(await tabA.unseenAnswer(LEARNER.key, undefined)).toBeNull();
  });

  it("keep no progress for an answer settled or let go meanwhile", async () => {
    const app = await load();
    await app.keepAnswer(KEPT);
    await app.sendKept("key-1");
    const progress = { ...KEPT, sampleId: "gvm_key-1", uploaded: true };

    await app.keepProgress(progress);
    expect(await app.settledOf("key-1")).toMatchObject({ kind: "marked" });
    await app.forgetAnswer("key-1");
    await app.keepProgress(progress);
    expect(await app.keptAnswers(LEARNER.key)).toEqual([]);
  });

  it("keep no progress over an answer another tab let go while this one read it", async () => {
    const tabA = await load();
    const tabB = await load();
    await tabA.keepAnswer(KEPT);
    // Both tabs' connections open, so neither waits on opening while the other writes.
    await Promise.all([
      tabA.keptAnswers(LEARNER.key),
      tabB.keptAnswers(LEARNER.key),
    ]);
    const progress = { ...KEPT, sampleId: "gvm_key-1" };

    await Promise.all([
      tabA.keepProgress(progress),
      tabB.forgetAnswer("key-1"),
    ]);
    expect(await tabA.keptAnswers(LEARNER.key)).toEqual([]);
  });

  it("keep sending an answer passed over, but never offer it or its outcome to be shown", async () => {
    const app = await load();
    await app.keepAnswer(KEPT);
    await app.passOver("key-1");
    await app.keepProgress({ ...KEPT, sampleId: "gvm_key-1" });
    expect(await app.unseenAnswer(LEARNER.key, undefined)).toBeNull();
    expect(await app.keptAnswers(LEARNER.key)).toMatchObject([
      { key: "key-1", sampleId: "gvm_key-1" },
    ]);

    await app.settleAnswer(KEPT, { kind: "refused", code: null, status: 400 });
    expect(await app.settledOf("key-1")).toBeNull();
    expect(await app.keptAnswers(LEARNER.key)).toEqual([]);
  });

  it("drop an outcome already given when its answer is passed over", async () => {
    const app = await load();
    await app.keepAnswer(KEPT);
    await app.sendKept("key-1");
    await app.passOver("key-1");
    expect(await app.settledOf("key-1")).toBeNull();
    expect(await app.unseenAnswer(LEARNER.key, undefined)).toBeNull();
  });

  it("belong to the learner who said them, sent or not", async () => {
    const app = await load();
    const theirs = (key: string, keptAt: number) => ({
      ...answerTo(OTHER, key, keptAt),
      learner: "device/other",
    });
    await app.keepAnswer(theirs("key-0", 0));
    await app.keepAnswer(theirs("key-2", 2));
    await app.sendKept("key-2");

    expect(await app.keptAnswers(LEARNER.key)).toEqual([]);
    expect(await app.unseenAnswer(LEARNER.key, undefined)).toBeNull();
    expect(await app.unseenAnswer("device/other", undefined)).toMatchObject({
      key: "key-0",
    });
  });

  it("send each learner's answers in their own run", async () => {
    const app = await load();
    await app.keepAnswer(KEPT);
    await app.keepAnswer({
      ...answerTo(OTHER, "key-2", 2),
      learner: "device/other",
    });
    const release = holdMarking();
    const first = app.sendKeptAnswers(LEARNER.key);
    await vi.waitFor(() =>
      expect(sent("POST /api/voice/samples/gvm_key-1/evaluation")).toHaveLength(
        1,
      ),
    );

    device.learner = "device/other";
    await app.sendKeptAnswers("device/other");
    expect(sent("POST /api/voice/samples/gvm_key-2/evaluation")).toHaveLength(
      1,
    );
    release();
    await first;
  });

  it("keep no answer its keeper no longer wants once the write begins", async () => {
    const app = await load();
    await app.keepAnswer(KEPT, () => false);
    expect(await app.keptAnswers(LEARNER.key)).toEqual([]);
  });

  it("send the next answer past one the voice API answered but did not mark", async () => {
    const app = await load();
    await app.keepAnswer(answerTo(OTHER, "key-0", 0));
    await app.keepAnswer(KEPT);
    server.busy = 1;

    await app.sendKeptAnswers(LEARNER.key);
    expect(await app.keptAnswers(LEARNER.key)).toMatchObject([
      { key: "key-0" },
    ]);
    expect(await app.settledOf("key-1")).toMatchObject({ kind: "marked" });
  });

  it("never send a learner's answer once the device learns as someone else", async () => {
    const app = await load();
    await app.keepAnswer(KEPT);
    device.learner = "uid-1/grace0000001";

    await expect(app.sendKept("key-1")).resolves.toMatchObject({
      kind: "kept",
      status: 0,
    });
    expect(server.asked).toEqual([]);
    expect(await app.keptAnswers(LEARNER.key)).toHaveLength(1);
  });

  it("stop at the first answer the voice API gave no answer to", async () => {
    const app = await load();
    await app.keepAnswer(answerTo(OTHER, "key-0", 0));
    await app.keepAnswer(KEPT);
    server.hung = 1;
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);

    const run = app.sendKeptAnswers(LEARNER.key);
    await vi.waitFor(() =>
      expect(sent("POST /api/voice/samples/gvm_key-0/evaluation")).toHaveLength(
        1,
      ),
    );
    deadline.abort(new DOMException("timed out", "TimeoutError"));
    await run;
    vi.restoreAllMocks();
    expect(await app.keptAnswers(LEARNER.key)).toHaveLength(2);
    expect(sent("POST /api/voice/samples")).toHaveLength(1);
  });

  it("count an answer as unsent while it is kept, and as sent once marked, shown or not", async () => {
    const app = await load();
    await app.keepAnswer(KEPT);
    server.busy = 1;

    await expect(app.sentEveryAnswer(LEARNER.key)).resolves.toBe(false);
    await expect(app.sentEveryAnswer(LEARNER.key)).resolves.toBe(true);
    expect(await app.unseenAnswer(LEARNER.key, undefined)).toMatchObject({
      key: "key-1",
    });
  });

  it("offer the oldest answer not yet shown, whatever its key", async () => {
    const app = await load();
    await app.keepAnswer(KEPT);
    await app.keepAnswer(answerTo(ASKED, "key-z", 0));
    expect(await app.unseenAnswer(LEARNER.key, undefined)).toEqual({
      key: "key-z",
      move: ASKED,
    });
  });

  it("store an outcome where an app from before outcomes does not read it as an answer to send", async () => {
    const app = await load();
    await app.keepAnswer(KEPT);
    await app.sendKept("key-1");
    const db = await app.openDB();
    const stored = await app.promisify<Array<{ learner?: string }>>(
      db
        .transaction(app.VOICE_ANSWER_STORE)
        .objectStore(app.VOICE_ANSWER_STORE)
        .getAll(),
    );
    // What that app sends: every record under the learner.
    expect(stored.filter((record) => record.learner === LEARNER.key)).toEqual(
      [],
    );
    expect(await app.unseenAnswer(LEARNER.key, undefined)).toMatchObject({
      key: "key-1",
    });
  });

  it("still send an answer kept without its step, and let it go once marked", async () => {
    const { move: _, ...withoutStep } = KEPT;
    await (await load()).keepAnswer(withoutStep);

    const app = await load();
    expect(await app.unseenAnswer(LEARNER.key, undefined)).toBeNull();
    await app.sendKeptAnswers(LEARNER.key);
    expect(sent("POST /api/voice/samples/gvm_key-1/evaluation")).toHaveLength(
      1,
    );
    expect(await app.keptAnswers(LEARNER.key)).toEqual([]);
    expect(await app.settledOf("key-1")).toBeNull();
  });

  it("give a lesson an outcome already on the device, however it got there", async () => {
    const app = await load();
    await app.keepAnswer(KEPT);
    await (await load()).sendKeptAnswers(LEARNER.key);

    await expect(
      app.whenSettled("key-1", new AbortController().signal),
    ).resolves.toMatchObject({ kind: "marked" });
  });

  it("give a lesson that was left no outcome, even one already on the device", async () => {
    const app = await load();
    await app.keepAnswer(KEPT);
    await app.sendKeptAnswers(LEARNER.key);
    const leaving = new AbortController();
    const outcome = vi.fn();
    void app.whenSettled("key-1", leaving.signal).then(outcome);
    leaving.abort();

    expect(await app.settledOf("key-1")).toMatchObject({ kind: "marked" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(outcome).not.toHaveBeenCalled();
  });
});
