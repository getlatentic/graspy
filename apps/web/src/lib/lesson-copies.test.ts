import {
  IDBFactory,
  IDBIndex,
  IDBKeyRange,
  IDBObjectStore,
} from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FRACTIONS = {
  planId: "plan-1",
  subjectSlug: "mathematics",
  topicIndex: 1,
  topic: "Fractions",
};
const DECIMALS = { ...FRACTIONS, topicIndex: 2, topic: "Decimals" };
const CARD = {
  resourceUri: "ui://graspy/lesson",
  toolName: "give_lesson",
  toolInput: {},
  toolResult: { content: [] },
};

// A fresh module per test: the app keeps one connection for the tab's lifetime.
async function fresh() {
  vi.resetModules();
  return import("@/lib/lesson-copies");
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the lesson copies", () => {
  it("are listed with the lesson each holds, without reading a card", async () => {
    const { copiedLessons, keepLessonCopy } = await fresh();
    await keepLessonCopy(FRACTIONS, CARD, "lesson-1");
    await keepLessonCopy(DECIMALS, CARD, null);
    const reads = [
      vi.spyOn(IDBObjectStore.prototype, "get"),
      vi.spyOn(IDBObjectStore.prototype, "getAll"),
      vi.spyOn(IDBObjectStore.prototype, "openCursor"),
      vi.spyOn(IDBIndex.prototype, "get"),
      vi.spyOn(IDBIndex.prototype, "getAll"),
      vi.spyOn(IDBIndex.prototype, "openCursor"),
    ];

    const copied = await copiedLessons();

    expect(copied).toHaveLength(2);
    expect(copied).toEqual(
      expect.arrayContaining([
        { ...FRACTIONS, lessonId: "lesson-1" },
        { ...DECIMALS, lessonId: null },
      ]),
    );
    for (const read of reads) expect(read).not.toHaveBeenCalled();
  });
});
