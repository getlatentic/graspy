import { describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";

const saved = { planId: "plan-1", subjects: [] } as unknown as CurriculumData;

vi.mock("@/lib/curriculum-db", () => ({ getCurriculum: async () => saved }));
vi.mock("@/lib/learner-record", () => ({
  changePlanRecord: () => new Promise(() => {}),
}));

const { loadSavedPlan } = await import("./saved-plan");

describe("loadSavedPlan", () => {
  it("opens the saved plan without waiting for the server", async () => {
    await expect(loadSavedPlan()).resolves.toBe(saved);
  });
});
