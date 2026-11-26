// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import { buildCurriculum } from "../lib/curriculum-accumulator";

const mocks = vi.hoisted(() => ({
  planLearningPath: vi.fn(),
  saveDetails: vi.fn(),
}));
vi.mock("@/lib/curriculum-api", () => ({
  planLearningPath: mocks.planLearningPath,
}));
vi.mock("@/features/onboarding/lib/details-save", () => ({
  saveDetails: mocks.saveDetails,
}));
vi.mock("../lib/said-details", () => ({
  detailsSaid: vi.fn().mockResolvedValue({ details: {}, voiceOnly: false }),
}));
vi.mock("@/lib/user-storage", () => ({ getUserProfile: () => null }));

const { useTutorActions } = await import("./use-tutor-actions");

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <I18nContext.Provider
      value={
        {
          t: (key: string) => key,
        } as unknown as React.ContextType<typeof I18nContext>
      }
    >
      {children}
    </I18nContext.Provider>
  </MemoryRouter>
);

const withClass = (gradeLevel: string) =>
  buildCurriculum({
    country: "NG",
    language: "en",
    gradeLevel,
    subjects: [],
    topics: {},
    nextSubjectSlug: "",
  });

afterEach(() => {
  cleanup();
  mocks.planLearningPath.mockReset();
  mocks.saveDetails.mockReset();
});

describe("a reply that saves the class and proposes a course", () => {
  it("plans the course for the class it saved, not the one before", async () => {
    mocks.planLearningPath.mockResolvedValue({
      subject: "Machine learning",
      goal: "Machine learning",
      steps: [{ title: "Machine learning", level: "SS 2" }],
    });
    // The plan the render holds has no class: the one that saves it comes after.
    mocks.saveDetails.mockImplementation(async (_details, _voice, apply) => {
      await apply(withClass("Secondary Year 2"));
      return "kept";
    });
    const applyCurriculum = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () =>
        useTutorActions({
          curriculum: withClass(""),
          applyCurriculum,
          regenerate: vi.fn(),
          onDone: vi.fn(),
          onFailure: vi.fn(),
        }),
      { wrapper },
    );

    await act(() =>
      result.current.carryOut([
        {
          type: "set_details",
          className: "Secondary Year 2",
          country: "Nigeria",
          course: "",
        },
        { type: "propose_path", goal: "Machine learning" },
      ]),
    );

    expect(mocks.planLearningPath).toHaveBeenCalledOnce();
    expect(mocks.planLearningPath.mock.calls[0][0]).toMatchObject({
      gradeLevel: "Secondary Year 2",
      goal: "Machine learning",
    });
  });
});
