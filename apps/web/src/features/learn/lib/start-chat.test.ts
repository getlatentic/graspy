// @vitest-environment jsdom
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";

const sync = vi.fn<() => Promise<CurriculumData | null>>();

async function device() {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.doMock("@/lib/plan-sync", () => ({ syncPlan: sync }));
  vi.doMock("@/lib/locale-detector", () => ({
    detectLocale: () => ({ language: "en", country: "NG" }),
  }));
  const [{ readyToChat }, db, storage] = await Promise.all([
    import("./start-chat"),
    import("@/lib/curriculum-db"),
    import("@/lib/user-storage"),
  ]);
  return { readyToChat, ...db, ...storage };
}

beforeEach(() => {
  localStorage.clear();
  sync.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("@/lib/plan-sync");
  vi.doUnmock("@/lib/locale-detector");
});

describe("a learner ready to chat with no onboarding", () => {
  it("has a plan with no subjects, English and the country the device suggests", async () => {
    const { readyToChat, getCurriculum, getUserProfile } = await device();

    expect(await readyToChat()).toBe(true);

    const plan = await getCurriculum();
    expect(plan?.subjects).toEqual([]);
    expect(plan?.countryCode).toBe("NG");
    expect(plan?.languageCode).toBe("en");
    expect(plan?.gradeLevel).toBe("");
    expect(getUserProfile()).toMatchObject({
      country: "NG",
      language: "en",
      gradeLevel: "",
      onboardingCompleted: true,
    });
  });

  it("is asked of the account first, and takes the plan it holds without making one", async () => {
    const { readyToChat, getCurriculum, holdCurriculum, saveCurriculum } =
      await device();
    const held = await saveCurriculum({
      country: "Nigeria",
      language: "English",
      gradeLevel: "JSS 1",
      subjects: [{ name: "Mathematics", slug: "mathematics" }],
      topics: {},
      assessment: { nextSubject: null },
    });
    await (await import("@/lib/curriculum-db")).deleteCurriculum();
    sync.mockImplementation(async () => {
      await holdCurriculum(held);
      return held;
    });

    expect(await readyToChat()).toBe(true);

    expect((await getCurriculum())?.planId).toBe(held.planId);
    expect((await getCurriculum())?.subjects).toHaveLength(1);
  });

  it("makes nothing when the account cannot be reached: a plan made then could replace theirs", async () => {
    sync.mockRejectedValue(new Error("offline"));
    const { readyToChat, getCurriculum, getUserProfile } = await device();

    expect(await readyToChat()).toBe(false);

    expect(await getCurriculum()).toBeNull();
    expect(getUserProfile()).toBeNull();
  });

  it("keeps what a learner who did onboarding told it, when their plan failed", async () => {
    const { readyToChat, getCurriculum, saveUserProfile } = await device();
    saveUserProfile({
      country: "GH",
      language: "en",
      gradeLevel: "Primary 4, Ghana, age 9",
    });

    expect(await readyToChat()).toBe(true);

    const plan = await getCurriculum();
    expect(plan?.countryCode).toBe("GH");
    expect(plan?.gradeLevel).toBe("Primary 4, Ghana, age 9");
  });
});
