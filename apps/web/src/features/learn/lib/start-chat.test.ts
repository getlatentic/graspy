// @vitest-environment jsdom
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";

const sync = vi.hoisted(() => vi.fn<() => Promise<CurriculumData | null>>());

// Mocked once, for the file. A doMock and doUnmock per test are queued and settled by whichever
// import comes first; the imports below run together, and a second settling of the queue can
// unmock what the first has just mocked, so that the real syncPlan is loaded.
vi.mock("@/lib/plan-sync", () => ({ syncPlan: sync }));
vi.mock("@/lib/locale-detector", () => ({
  detectLocale: () => ({ language: "en", country: "NG" }),
}));

async function device() {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  const [{ readyToChat }, db, storage] = await Promise.all([
    import("./start-chat"),
    import("@/lib/curriculum-db"),
    import("@/lib/user-storage"),
  ]);
  return { readyToChat, ...db, ...storage };
}

beforeEach(() => {
  localStorage.clear();
  sync.mockReset();
  sync.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a learner ready to chat with no onboarding", () => {
  it("has a plan with no subjects and English, and no country: the device's guess is not kept", async () => {
    const { readyToChat, getCurriculum, getUserProfile } = await device();

    expect(await readyToChat()).toBe(true);

    const plan = await getCurriculum();
    expect(plan?.subjects).toEqual([]);
    expect(plan?.countryCode).toBe("");
    expect(plan?.languageCode).toBe("en");
    expect(plan?.gradeLevel).toBe("");
    expect(getUserProfile()).toMatchObject({
      country: "",
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

  it("makes nothing for a learner who said their class and has no plan: the app's own plan loading makes theirs", async () => {
    const { readyToChat, getCurriculum, getUserProfile, saveUserProfile } =
      await device();
    saveUserProfile({
      country: "GH",
      language: "en",
      gradeLevel: "Primary 4, Ghana, age 9",
      onboardingCompleted: true,
    });

    expect(await readyToChat()).toBe(false);

    expect(await getCurriculum()).toBeNull();
    expect(getUserProfile()?.gradeLevel).toBe("Primary 4, Ghana, age 9");
  });

  it("starts again for a profile an earlier open of the link made, which has no class, without the country it guessed", async () => {
    const { readyToChat, getCurriculum, getUserProfile, saveUserProfile } =
      await device();
    saveUserProfile({ country: "GH", language: "en", gradeLevel: "" });

    expect(await readyToChat()).toBe(true);

    const plan = await getCurriculum();
    expect(plan?.countryCode).toBe("");
    expect(getUserProfile()?.country).toBe("");
    expect(plan?.startedInChat).toBe(true);
  });

  it("marks the plan it makes, so that no other is made from the profile until a subject is added", async () => {
    const { readyToChat, getCurriculum } = await device();

    await readyToChat();

    expect((await getCurriculum())?.startedInChat).toBe(true);
  });

  it("makes one plan for two opens of the link at once", async () => {
    const { readyToChat, getCurriculum } = await device();
    const keep = vi.spyOn(
      await import("@/lib/curriculum-db"),
      "saveCurriculum",
    );

    const [first, second] = await Promise.all([readyToChat(), readyToChat()]);

    expect([first, second]).toEqual([true, true]);
    expect(sync).toHaveBeenCalledOnce();
    expect(keep).toHaveBeenCalledOnce();
    expect(await getCurriculum()).not.toBeNull();
  });

  it("keeps the plan it made when the link is opened again", async () => {
    const { readyToChat, getCurriculum } = await device();

    await readyToChat();
    const made = await getCurriculum();
    await readyToChat();

    expect((await getCurriculum())?.planId).toBe(made?.planId);
  });

  it("leaves a plan and profile the device holds as they are", async () => {
    const {
      readyToChat,
      getCurriculum,
      getUserProfile,
      saveCurriculum,
      saveUserProfile,
    } = await device();
    const held = await saveCurriculum({
      country: "Ghana",
      countryCode: "GH",
      language: "English",
      gradeLevel: "Primary 4, Ghana, age 9",
      subjects: [{ name: "Mathematics", slug: "mathematics" }],
      topics: {},
      assessment: { nextSubject: null },
    });
    saveUserProfile({
      country: "GH",
      language: "en",
      gradeLevel: "Primary 4, Ghana, age 9",
      preferredSubjects: ["Mathematics"],
    });
    const profile = getUserProfile();

    expect(await readyToChat()).toBe(true);

    expect(await getCurriculum()).toEqual(held);
    expect(sync).not.toHaveBeenCalled();
    expect(getUserProfile()).toMatchObject({
      country: "GH",
      gradeLevel: profile?.gradeLevel,
      onboardingCompleted: true,
    });
    expect((await getCurriculum())?.startedInChat).toBeUndefined();
  });
});
