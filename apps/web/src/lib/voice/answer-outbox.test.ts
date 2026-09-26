import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  answerTo,
  holdMarking,
  KEPT,
  LEARNER,
  OTHER,
  resetServer,
  respond,
  sent,
} from "./voice-worker.fake";

vi.mock("@/lib/api/session", () => ({ fetchWithSession: respond }));
vi.mock("@/lib/env", () => ({ API_BASE_URL: "https://api.test/api" }));

// A fresh module per load: the app keeps one IndexedDB connection for the tab's lifetime.
async function load() {
  vi.resetModules();
  return {
    ...(await import("./answer-store")),
    ...(await import("./answer-outbox")),
  };
}

beforeEach(() => {
  resetServer();
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
