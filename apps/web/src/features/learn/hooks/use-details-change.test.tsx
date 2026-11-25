// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearnerDetails } from "@/lib/user-storage";

const saveDetails = vi.fn();
const detailsSaid = vi.fn();
let profile: Partial<LearnerDetails> | null = null;

vi.mock("@/features/onboarding/lib/details-save", () => ({ saveDetails }));
vi.mock("../lib/said-details", () => ({ detailsSaid }));
vi.mock("@/lib/user-storage", () => ({ getUserProfile: () => profile }));
vi.mock("@/lib/i18n-context", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const { useDetailsChange } = await import("./use-details-change");

const said = {
  type: "set_details" as const,
  className: "Grade 5",
  country: "Ghana",
  course: "",
};
const details = { country: "GH", gradeLevel: "Grade 5" };

function change() {
  const onFailure = vi.fn();
  const applyCurriculum = vi.fn();
  const { result } = renderHook(() =>
    useDetailsChange({ applyCurriculum, onFailure }),
  );
  return { run: () => result.current(said), onFailure, applyCurriculum };
}

beforeEach(() => {
  saveDetails.mockReset();
  detailsSaid.mockReset();
  detailsSaid.mockResolvedValue({ details, voiceOnly: false });
  saveDetails.mockResolvedValue("kept");
});

describe("what the tutor is told to save of a learner's school", () => {
  it("fills in a class not yet kept, through the details path", async () => {
    profile = { country: "NG", gradeLevel: "" };
    const { run, onFailure, applyCurriculum } = change();

    await run();

    expect(saveDetails).toHaveBeenCalledWith(details, false, applyCurriculum);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("never changes a class that is kept, whatever the model sent", async () => {
    profile = { country: "NG", gradeLevel: "JSS 2" };
    const { run, onFailure } = change();

    await run();

    expect(detailsSaid).not.toHaveBeenCalled();
    expect(saveDetails).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("says so when what the learner named is not in the catalogue, so the tutor can ask again", async () => {
    profile = { country: "NG", gradeLevel: "" };
    detailsSaid.mockResolvedValue(null);
    const { run, onFailure } = change();

    await run();

    expect(saveDetails).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith("chat.detailsNotKept");
  });

  it("says so when saving fails", async () => {
    profile = { country: "NG", gradeLevel: "" };
    saveDetails.mockResolvedValue("failed");
    const { run, onFailure } = change();

    await run();

    expect(onFailure).toHaveBeenCalledWith("chat.detailsNotKept");
  });
});
