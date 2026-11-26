// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { createMemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import {
  deleteCurriculum,
  getCurriculum,
  saveCurriculum,
} from "@/lib/curriculum-db";
import { getUserProfile, saveUserProfile } from "@/lib/user-storage";
import { signedInAs } from "@/test/account-session";

const syncPlan = vi.fn();
vi.mock("@/lib/plan-sync", () => ({ syncPlan }));

const { routes } = await import("@/routes");

// The first visit to a route imports its page, which takes longer than the default five seconds.
vi.setConfig({ testTimeout: 30_000 });

async function opened(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  router.initialize();
  // Initialised once the route's lazy page has been imported, which is the slow first visit the
  // test timeout allows for; waitFor's own default of one second is not.
  await vi.waitFor(
    () => {
      expect(router.state.initialized).toBe(true);
      expect(router.state.navigation.state).toBe("idle");
    },
    { timeout: 20_000 },
  );
  return router.state.location.pathname;
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  syncPlan.mockReset();
  syncPlan.mockResolvedValue(null);
  await deleteCurriculum();
  setAccount(null);
  signedInAs({ id: "ada000000001", name: "Ada" });
});

describe("/try for a learner who already has a plan and a class", () => {
  it("opens the chat and leaves their plan and profile as they are", async () => {
    const plan = await saveCurriculum({
      country: "Nigeria",
      countryCode: "NG",
      language: "English",
      gradeLevel: "JSS 1 (Junior Secondary School), Nigeria, age 12",
      subjects: [{ name: "Mathematics", slug: "mathematics" }],
      topics: { mathematics: ["Fractions"] },
      assessment: { nextSubject: null },
    });
    saveUserProfile({
      country: "NG",
      language: "en",
      gradeLevel: plan.gradeLevel,
      preferredSubjects: ["Mathematics"],
    });

    expect(await opened("/try")).toBe("/app/learn/ask/general");

    expect(await getCurriculum()).toEqual(plan);
    expect(getUserProfile()).toMatchObject({
      gradeLevel: plan.gradeLevel,
      onboardingCompleted: true,
    });
    expect(syncPlan).not.toHaveBeenCalled();
  });

  it("takes the plan their account holds on a new device, instead of making one", async () => {
    const held = await saveCurriculum({
      country: "Nigeria",
      countryCode: "NG",
      language: "English",
      gradeLevel: "JSS 1 (Junior Secondary School), Nigeria, age 12",
      subjects: [{ name: "Mathematics", slug: "mathematics" }],
      topics: {},
      assessment: { nextSubject: null },
    });
    await deleteCurriculum();
    const { holdCurriculum } = await import("@/lib/curriculum-db");
    syncPlan.mockImplementation(async () => {
      await holdCurriculum(held);
      return held;
    });

    expect(await opened("/try")).toBe("/app/learn/ask/general");

    expect((await getCurriculum())?.planId).toBe(held.planId);
    expect((await getCurriculum())?.startedInChat).toBeUndefined();
  });
});
