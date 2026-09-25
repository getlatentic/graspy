import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REF = {
  planId: "plan-1",
  subjectSlug: "mathematics",
  topicIndex: 1,
  topic: "Fractions",
};
const LESSON = { title: "Fractions", keyPoints: [], slides: [] };

async function withDevice() {
  vi.resetModules();
  const idb = await import("@/lib/idb");
  const records = await import("./device-records");
  const db = await idb.openDB();
  const tx = db.transaction(
    [idb.LESSON_STORE, idb.PROGRESS_STORE, idb.PRACTICE_STORE],
    "readwrite",
  );
  tx.objectStore(idb.LESSON_STORE).put({
    ...REF,
    lesson: LESSON,
    session: {},
    savedAt: 1,
  });
  tx.objectStore(idb.PROGRESS_STORE).put({ ...REF, learntAt: 2 });
  tx.objectStore(idb.PRACTICE_STORE).put({
    messageId: "m1",
    planId: "plan-1",
    subjectSlug: "mathematics",
    question: "3/8 as a decimal?",
    correct: false,
    answeredAt: 3,
  });
  await idb.committed(tx);
  return records;
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("what the device kept", () => {
  it("is read in the shape the server's import takes", async () => {
    const { deviceRecords } = await withDevice();

    expect(await deviceRecords()).toEqual({
      topics: [{ ...REF, learntAt: 2 }],
      answers: [
        {
          planId: "plan-1",
          subjectSlug: "mathematics",
          key: "m1:3/8 as a decimal?",
          source: "practice",
          question: "3/8 as a decimal?",
          correct: false,
          at: 3,
        },
      ],
      lessons: [{ topic: REF, lesson: LESSON }],
    });
  });

  it("is gone once cleared", async () => {
    const { clearDeviceRecords, deviceRecords, isEmpty } = await withDevice();

    await clearDeviceRecords();

    expect(isEmpty(await deviceRecords())).toBe(true);
  });
});
