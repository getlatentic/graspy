// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TutorAction } from "@/lib/a2a/reply-data";
import type { LearningPath } from "@/lib/curriculum-api";
import { I18nContext } from "@/lib/i18n-context";
import { buildCurriculum } from "../lib/curriculum-accumulator";
import { useTutorActions } from "./use-tutor-actions";

const mocks = vi.hoisted(() => ({ planLearningPath: vi.fn() }));
vi.mock("@/lib/curriculum-api", () => ({
  planLearningPath: mocks.planLearningPath,
}));

const MATHS = { name: "Mathematics", slug: "mathematics" };
const CURRICULUM = buildCurriculum({
  country: "NG",
  language: "en",
  gradeLevel: "SS 2",
  subjects: [MATHS],
  topics: { mathematics: ["Quadratic Equations"] },
  nextSubjectSlug: "mathematics",
});
const GOALS = [
  "machine learning",
  "maths of machine learning",
  "quantum computing",
];

function pathTo(goal: string): LearningPath {
  return {
    subject: goal,
    goal,
    steps: [
      { title: `${goal}: first steps`, level: "SS 2" },
      { title: goal, level: "SS 3" },
    ],
  };
}

const proposals = (goals: string[]): TutorAction[] =>
  goals.map((goal) => ({ type: "propose_path", goal }));

function mount() {
  const applyCurriculum = vi.fn().mockResolvedValue(undefined);
  const onDone = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <I18nContext.Provider
        value={
          {
            t: (key: string, values?: Record<string, string>) =>
              `${key} ${values?.subject ?? ""}`.trim(),
          } as unknown as React.ContextType<typeof I18nContext>
        }
      >
        {children}
      </I18nContext.Provider>
    </MemoryRouter>
  );
  const hook = renderHook(
    () =>
      useTutorActions({
        curriculum: CURRICULUM,
        applyCurriculum,
        regenerate: vi.fn(),
        onDone,
        onFailure: vi.fn(),
      }),
    { wrapper },
  );
  return { hook, applyCurriculum, onDone };
}

afterEach(() => {
  cleanup();
  mocks.planLearningPath.mockReset();
});

describe("a reply that asks for several courses", () => {
  it("plans each course and shows them together", async () => {
    mocks.planLearningPath.mockImplementation(({ goal }) =>
      Promise.resolve(pathTo(goal)),
    );
    const { hook } = mount();

    await act(() => hook.result.current.carryOut(proposals(GOALS)));

    const shown = hook.result.current.pendingPlanChange;
    expect(shown?.type).toBe("propose_path");
    expect(
      shown?.type === "propose_path" && shown.proposals.map((p) => p.goal),
    ).toEqual(GOALS);
    expect(mocks.planLearningPath).toHaveBeenCalledTimes(3);
  });

  it("adds every planned course as its own subject, each with a link", async () => {
    mocks.planLearningPath.mockImplementation(({ goal }) =>
      Promise.resolve(pathTo(goal)),
    );
    const { hook, applyCurriculum, onDone } = mount();
    await act(() => hook.result.current.carryOut(proposals(GOALS)));

    await act(() => hook.result.current.confirmPlanChange());

    expect(applyCurriculum).toHaveBeenCalledOnce();
    const kept = applyCurriculum.mock.calls[0][0];
    expect(kept.subjects.map((s: { name: string }) => s.name)).toEqual([
      "Mathematics",
      ...GOALS,
    ]);
    expect(kept.topics.mathematics).toEqual(["Quadratic Equations"]);
    expect(kept.topics["quantum-computing"]).toEqual([
      "quantum computing: first steps",
      "quantum computing",
    ]);
    expect(onDone).toHaveBeenCalledTimes(3);
    expect(hook.result.current.pendingPlanChange).toBeNull();
  });

  it("adds the courses that were planned when one could not be", async () => {
    mocks.planLearningPath.mockImplementation(({ goal }) =>
      goal === "quantum computing"
        ? Promise.reject(new Error("no plan"))
        : Promise.resolve(pathTo(goal)),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { hook, applyCurriculum } = mount();
    await act(() => hook.result.current.carryOut(proposals(GOALS)));
    await waitFor(() =>
      expect(hook.result.current.pendingPlanChange).toMatchObject({
        proposals: [{ failed: false }, { failed: false }, { failed: true }],
      }),
    );

    await act(() => hook.result.current.confirmPlanChange());

    const names = applyCurriculum.mock.calls[0][0].subjects.map(
      (s: { name: string }) => s.name,
    );
    expect(names).toEqual(["Mathematics", ...GOALS.slice(0, 2)]);
  });

  it("is replaced, not added to, by the next reply's courses", async () => {
    mocks.planLearningPath.mockImplementation(({ goal }) =>
      Promise.resolve(pathTo(goal)),
    );
    const { hook } = mount();
    await act(() => hook.result.current.carryOut(proposals(GOALS)));

    await act(() => hook.result.current.carryOut(proposals(["astronomy"])));

    expect(hook.result.current.pendingPlanChange).toMatchObject({
      proposals: [{ goal: "astronomy" }],
    });
  });
});
