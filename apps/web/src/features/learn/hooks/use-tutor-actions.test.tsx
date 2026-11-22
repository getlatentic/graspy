// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TutorAction } from "@/lib/a2a/reply-data";
import type { LearningPath } from "@/lib/curriculum-api";
import type { CurriculumData } from "@/lib/curriculum-record";
import { I18nContext } from "@/lib/i18n-context";
import { buildCurriculum } from "../lib/curriculum-accumulator";
import { MAX_SUBJECTS } from "../lib/curriculum-edit";
import {
  PATH_PLAN_TIMEOUT_MS,
  usePathProposal,
  type PathProposals,
} from "./use-path-proposal";
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

function pathTo(goal: string, steps = 2): LearningPath {
  return {
    subject: goal,
    goal,
    steps: Array.from({ length: steps }, (_, n) => ({
      title: n === steps - 1 ? goal : `${goal}: step ${n + 1}`,
      level: "SS 2",
    })),
  };
}

const proposals = (goals: string[]): TutorAction[] =>
  goals.map((goal) => ({ type: "propose_path", goal }));

function planAll() {
  mocks.planLearningPath.mockImplementation(({ goal }) =>
    Promise.resolve(pathTo(goal)),
  );
}

/** A plan that settles when the test says so. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <I18nContext.Provider
      value={
        {
          t: (key: string, values?: Record<string, string>) =>
            `${key} ${values?.subject ?? values?.count ?? ""}`.trim(),
        } as unknown as React.ContextType<typeof I18nContext>
      }
    >
      {children}
    </I18nContext.Provider>
  </MemoryRouter>
);

function mount(curriculum: CurriculumData = CURRICULUM) {
  const applyCurriculum = vi.fn().mockResolvedValue(undefined);
  const regenerate = vi.fn().mockResolvedValue(undefined);
  const onDone = vi.fn();
  const onFailure = vi.fn();
  const hook = renderHook(
    () =>
      useTutorActions({
        curriculum,
        applyCurriculum,
        regenerate,
        onDone,
        onFailure,
      }),
    { wrapper },
  );
  const shown = () => {
    const change = hook.result.current.pendingPlanChange;
    return change?.type === "propose_path" ? change.proposals : null;
  };
  return { hook, applyCurriculum, onDone, onFailure, shown };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.planLearningPath.mockReset();
});

describe("a reply that asks for several courses", () => {
  it("plans each course and shows them together", async () => {
    planAll();
    const { hook, shown } = mount();

    await act(() => hook.result.current.carryOut(proposals(GOALS)));

    expect(shown()?.map((p) => p.goal)).toEqual(GOALS);
    expect(mocks.planLearningPath).toHaveBeenCalledTimes(3);
  });

  it("adds every planned course as its own subject, each with a link", async () => {
    planAll();
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
      "quantum computing: step 1",
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
    const { hook, applyCurriculum, shown } = mount();
    await act(() => hook.result.current.carryOut(proposals(GOALS)));
    expect(shown()?.map((p) => p.failed)).toEqual([false, false, true]);

    await act(() => hook.result.current.confirmPlanChange());

    const names = applyCurriculum.mock.calls[0][0].subjects.map(
      (s: { name: string }) => s.name,
    );
    expect(names).toEqual(["Mathematics", ...GOALS.slice(0, 2)]);
  });

  it("repeats a course the learner named twice once, whatever its case", async () => {
    planAll();
    const { hook, shown } = mount();

    await act(() =>
      hook.result.current.carryOut(
        proposals(["Quantum computing", "quantum computing"]),
      ),
    );

    expect(shown()).toHaveLength(1);
  });
});

describe("a plan that arrives late", () => {
  it("does not overwrite the proposals of the reply that replaced them", async () => {
    const slow = deferred<LearningPath>();
    const fast = deferred<LearningPath>();
    mocks.planLearningPath
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const { hook, shown } = mount();
    let first!: Promise<void>;
    act(() => {
      first = hook.result.current.carryOut(proposals(["quantum computing"]));
    });
    let second!: Promise<void>;
    act(() => {
      second = hook.result.current.carryOut(proposals(["quantum computing"]));
    });

    await act(async () => {
      fast.resolve(pathTo("quantum computing", 3));
      await second;
    });
    await act(async () => {
      slow.resolve(pathTo("quantum computing", 2));
      await first;
    });

    expect(shown()?.[0].path?.steps).toHaveLength(3);
  });

  it("does not bring back a card the learner dismissed", async () => {
    const slow = deferred<LearningPath>();
    mocks.planLearningPath.mockReturnValue(slow.promise);
    const { hook } = mount();
    let asked!: Promise<void>;
    act(() => {
      asked = hook.result.current.carryOut(proposals(["astronomy"]));
    });

    act(() => hook.result.current.dismissPlanChange());
    await act(async () => {
      slow.resolve(pathTo("astronomy"));
      await asked;
    });

    expect(hook.result.current.pendingPlanChange).toBeNull();
  });

  it("does not take the place of a confirmation that replaced the card", async () => {
    const slow = deferred<LearningPath>();
    mocks.planLearningPath.mockReturnValue(slow.promise);
    const { hook } = mount();
    let asked!: Promise<void>;
    act(() => {
      asked = hook.result.current.carryOut(proposals(["astronomy"]));
    });

    await act(() => hook.result.current.carryOut([{ type: "rebuild_plan" }]));
    await act(async () => {
      slow.resolve(pathTo("astronomy"));
      await asked;
    });

    expect(hook.result.current.pendingPlanChange).toEqual({
      type: "rebuild_plan",
    });
  });
});

describe("courses asked for in the same reply as a confirmation", () => {
  it("shows the confirmation of a rebuild and proposes nothing", async () => {
    planAll();
    const { hook } = mount();

    await act(() =>
      hook.result.current.carryOut([
        ...proposals(GOALS),
        { type: "rebuild_plan" },
      ]),
    );

    expect(hook.result.current.pendingPlanChange).toEqual({
      type: "rebuild_plan",
    });
    expect(mocks.planLearningPath).not.toHaveBeenCalled();
  });

  it("shows the confirmation of a dropped subject and proposes nothing", async () => {
    planAll();
    const { hook } = mount();

    await act(() =>
      hook.result.current.carryOut([
        { type: "change_subjects", add: [], remove: ["Mathematics"] },
        ...proposals(GOALS),
      ]),
    );

    expect(hook.result.current.pendingPlanChange).toMatchObject({
      type: "change_subjects",
      removed: ["Mathematics"],
    });
    expect(mocks.planLearningPath).not.toHaveBeenCalled();
  });
});

describe("a course that is slow to plan", () => {
  it("does not hold the others, and can be tried again", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const signals: AbortSignal[] = [];
    mocks.planLearningPath.mockImplementation(
      ({ goal }, signal: AbortSignal) => {
        if (goal !== "quantum computing") return Promise.resolve(pathTo(goal));
        signals.push(signal);
        return new Promise<LearningPath>((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted"))),
        );
      },
    );
    const { hook, applyCurriculum, shown } = mount();
    let asked!: Promise<void>;
    act(() => {
      asked = hook.result.current.carryOut(proposals(GOALS));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(shown()?.map((p) => Boolean(p.path))).toEqual([true, true, false]);

    // The two that are ready can be added while the third is still planning.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PATH_PLAN_TIMEOUT_MS);
      await asked;
    });
    expect(shown()?.map((p) => p.failed)).toEqual([false, false, true]);
    expect(signals[0].aborted).toBe(true);

    mocks.planLearningPath.mockImplementation(({ goal }) =>
      Promise.resolve(pathTo(goal)),
    );
    await act(() => hook.result.current.retryPath("quantum computing"));
    expect(shown()?.map((p) => Boolean(p.path))).toEqual([true, true, true]);

    await act(() => hook.result.current.confirmPlanChange());
    expect(applyCurriculum.mock.calls[0][0].subjects).toHaveLength(4);
  });

  it("lets the learner add the ready courses before the slow one answers", async () => {
    const never = new Promise<LearningPath>(() => {});
    mocks.planLearningPath.mockImplementation(({ goal }) =>
      goal === "quantum computing" ? never : Promise.resolve(pathTo(goal)),
    );
    const { hook, applyCurriculum } = mount();
    await act(async () => {
      void hook.result.current.carryOut(proposals(GOALS));
    });

    await act(() => hook.result.current.confirmPlanChange());

    const names = applyCurriculum.mock.calls[0][0].subjects.map(
      (s: { name: string }) => s.name,
    );
    expect(names).toEqual(["Mathematics", ...GOALS.slice(0, 2)]);
    expect(hook.result.current.pendingPlanChange).toBeNull();
  });
});

describe("a course tried again", () => {
  it("ends the request it replaces, so two are not running", async () => {
    const signals: AbortSignal[] = [];
    mocks.planLearningPath.mockImplementation((_, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<LearningPath>(() => {});
    });
    const { hook } = mount();
    await act(async () => {
      void hook.result.current.carryOut(proposals(["astronomy"]));
    });

    await act(async () => {
      void hook.result.current.retryPath("Astronomy");
    });

    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
  });

  it("ends every request when the learner dismisses the card", async () => {
    const signals: AbortSignal[] = [];
    mocks.planLearningPath.mockImplementation((_, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<LearningPath>(() => {});
    });
    const { hook } = mount();
    await act(async () => {
      void hook.result.current.carryOut(proposals(GOALS));
    });

    act(() => hook.result.current.dismissPlanChange());

    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});

describe("adding the courses", () => {
  it("says a course is already there instead of saying it was added", async () => {
    planAll();
    const { hook, applyCurriculum, onDone } = mount();
    await act(() => hook.result.current.carryOut(proposals(["MATHEMATICS"])));

    await act(() => hook.result.current.confirmPlanChange());

    expect(applyCurriculum).not.toHaveBeenCalled();
    expect(onDone.mock.calls.map(([message]) => message)).toEqual([
      "chat.pathExists Mathematics",
    ]);
  });

  it("says a course with no name was not added", async () => {
    mocks.planLearningPath.mockResolvedValue({
      subject: " ",
      goal: " ",
      steps: [],
    });
    const { hook, applyCurriculum, onFailure } = mount();
    await act(() => hook.result.current.carryOut(proposals(["astronomy"])));

    await act(() => hook.result.current.confirmPlanChange());

    expect(applyCurriculum).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith("chat.pathUnnamed");
  });

  it("adds none beyond the most a plan holds, and says so", async () => {
    planAll();
    const full = {
      ...CURRICULUM,
      subjects: Array.from({ length: MAX_SUBJECTS }, (_, n) => ({
        name: `Subject ${n}`,
        slug: `subject-${n}`,
      })),
    };
    const { hook, applyCurriculum, onDone, onFailure } = mount(full);
    await act(() => hook.result.current.carryOut(proposals(GOALS)));

    await act(() => hook.result.current.confirmPlanChange());

    expect(applyCurriculum).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(`chat.pathsFull ${MAX_SUBJECTS}`);
  });
});

describe("usePathProposal", () => {
  it("ignores a plan that arrives after its screen closed", async () => {
    const slow = deferred<LearningPath>();
    mocks.planLearningPath.mockReturnValue(slow.promise);
    const show = vi.fn<(change: PathProposals) => void>();
    const { result, unmount } = renderHook(() =>
      usePathProposal(CURRICULUM, show),
    );
    let asked!: Promise<void>;
    act(() => {
      asked = result.current.propose(["astronomy"]);
    });
    expect(show).toHaveBeenCalledTimes(1);

    unmount();
    slow.resolve(pathTo("astronomy"));
    await asked;

    expect(show).toHaveBeenCalledTimes(1);
  });
});
