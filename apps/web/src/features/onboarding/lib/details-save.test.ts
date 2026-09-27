import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";
import { LearnerChanged } from "@/lib/learner-pin";
import type { LearnerDetails } from "@/lib/user-storage";

const keepDetails =
  vi.fn<(learner: LearnerDetails, voiceOnly: boolean) => Promise<unknown>>();
vi.mock("./details-plan", () => ({ keepDetails }));

const { saveDetails } = await import("./details-save");

const learner = { country: "NG", level: "primary-2" } as LearnerDetails;
const plan = { planId: "plan-1" } as CurriculumData;
const apply = vi.fn(async (_plan: CurriculumData) => undefined);

beforeEach(() => {
  keepDetails.mockReset();
  apply.mockClear();
});

describe("saveDetails", () => {
  it("has the plan the details keep take them", async () => {
    keepDetails.mockResolvedValue(plan);

    await expect(saveDetails(learner, false, apply)).resolves.toBe("kept");

    expect(keepDetails).toHaveBeenCalledWith(learner, false);
    expect(apply).toHaveBeenCalledWith(plan);
  });

  it("keeps the details of a learner with no plan", async () => {
    keepDetails.mockResolvedValue(null);

    await expect(saveDetails(learner, false, apply)).resolves.toBe("kept");

    expect(apply).not.toHaveBeenCalled();
  });

  it("leaves the save to nobody once the device learns as someone else", async () => {
    keepDetails.mockRejectedValue(new LearnerChanged());

    await expect(saveDetails(learner, false, apply)).resolves.toBe("left");

    expect(apply).not.toHaveBeenCalled();
  });

  it("fails for the learner to try again when the details could not be kept", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    keepDetails.mockRejectedValue(new Error("IndexedDB refused"));

    await expect(saveDetails(learner, false, apply)).resolves.toBe("failed");
  });

  it("fails for the learner to try again when the plan could not take them", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    keepDetails.mockResolvedValue(plan);
    apply.mockRejectedValueOnce(new Error("IndexedDB refused"));

    await expect(saveDetails(learner, false, apply)).resolves.toBe("failed");
  });
});
