import { beforeEach, describe, expect, it, vi } from "vitest";
import contract from "./a2a/reply-contract.json";

const records = { topics: [], answers: [], lessons: [] as unknown[] };
const deviceRecords = vi.fn(async () => records);
const clearDeviceRecords = vi.fn(async () => undefined);
vi.mock("@/lib/device-records", () => ({
  deviceRecords,
  clearDeviceRecords,
  isEmpty: (kept: typeof records) =>
    kept.topics.length + kept.answers.length + kept.lessons.length === 0,
}));
const fetchWithSession = vi.fn();
vi.mock("@/lib/api/session", () => ({ fetchWithSession }));

const RECORD = contract.learner;

function stubStorage(entries: Record<string, string> = {}) {
  const store = new Map(Object.entries(entries));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
  return store;
}

const answer = (body: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 503,
  json: async () => body,
  headers: new Headers(),
});

function serve(importOk = true) {
  fetchWithSession.mockImplementation(async (url: string) =>
    url.endsWith("/learner/import") ? answer({}, importOk) : answer(RECORD),
  );
}

const imports = () =>
  fetchWithSession.mock.calls.filter(([url]) =>
    url.endsWith("/learner/import"),
  );

async function fresh() {
  vi.resetModules();
  return import("./learner-record");
}

beforeEach(() => {
  vi.unstubAllGlobals();
  fetchWithSession.mockReset();
  records.lessons = [];
  clearDeviceRecords.mockClear();
});

describe("the learner's record", () => {
  it("is read from the server as it sends it", async () => {
    stubStorage({ "graspy.records.imported": "1" });
    fetchWithSession.mockResolvedValue(answer(RECORD));
    const { learnerRecord, planMarks } = await fresh();

    const record = await learnerRecord("plan-1");

    expect(fetchWithSession.mock.calls[0][0]).toMatch(
      /\/learner\?planId=plan-1$/,
    );
    const { learnt, ready } = planMarks(record);
    expect(learnt.map((mark) => mark.topic)).toEqual(["Fractions"]);
    expect(ready.map((mark) => mark.lessonId)).toEqual(["lesson-1"]);
  });

  it("is the last one read while the server cannot be reached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubStorage({
      "graspy.records.imported": "1",
      "graspy.learner.plan-1": JSON.stringify(RECORD),
    });
    fetchWithSession.mockRejectedValue(new TypeError("Failed to fetch"));
    const { learnerRecord } = await fresh();

    await expect(learnerRecord("plan-1")).resolves.toEqual(RECORD);
  });

  it("brings the device's own records across once, then clears them", async () => {
    const store = stubStorage();
    records.lessons = [{ topic: {}, lesson: {} }];
    serve();
    const { learnerRecord } = await fresh();

    await Promise.all([learnerRecord("plan-1"), learnerRecord("plan-1")]);
    await learnerRecord("plan-1");

    expect(imports()).toHaveLength(1);
    expect(clearDeviceRecords).toHaveBeenCalledTimes(1);
    expect(store.get("graspy.records.imported")).toBe("1");
  });

  it("tries the import again after it failed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubStorage();
    records.lessons = [{ topic: {}, lesson: {} }];
    serve(false);
    const { learnerRecord } = await fresh();

    await learnerRecord("plan-1");
    expect(clearDeviceRecords).not.toHaveBeenCalled();
    serve();
    await learnerRecord("plan-1");

    expect(imports()).toHaveLength(2);
    expect(clearDeviceRecords).toHaveBeenCalledTimes(1);
  });
});

describe("a mark made on this device", () => {
  it("stays in the record read offline until the server's says so too", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubStorage({
      "graspy.records.imported": "1",
      "graspy.learner.plan-1": JSON.stringify(RECORD),
    });
    fetchWithSession.mockRejectedValue(new TypeError("Failed to fetch"));
    const { learnerRecord, planMarks, rememberMark } = await fresh();
    const topic = {
      planId: "plan-1",
      subjectSlug: "mathematics",
      topicIndex: 3,
      topic: "Decimals",
    };

    rememberMark(topic, "learnt");
    rememberMark(topic, "ready");

    const { learnt, ready } = planMarks(await learnerRecord("plan-1"));
    expect(learnt.map((mark) => mark.topic)).toEqual(["Fractions", "Decimals"]);
    expect(ready.map((mark) => mark.topic)).toContain("Decimals");
  });
});

describe("the tally of the tutor's practice", () => {
  it("counts practice overall and per subject, and not the lessons' checks", async () => {
    const { tally } = await fresh();
    const at = (
      subjectSlug: string | null,
      correct: boolean,
      source: "practice" | "lesson" = "practice",
    ) => ({ subjectSlug, correct, source, question: "q", at: 1 });

    const { total, bySubject } = tally([
      at("mathematics", true),
      at("mathematics", false),
      at("english", true),
      at(null, true),
      at("mathematics", false, "lesson"),
    ]);

    expect(total).toEqual({ answered: 4, right: 3 });
    expect(Object.fromEntries(bySubject)).toEqual({
      mathematics: { answered: 2, right: 1 },
      english: { answered: 1, right: 1 },
    });
  });
});
