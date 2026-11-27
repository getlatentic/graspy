// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddedPath, TutorAction } from "@/lib/a2a/reply-data";
import type { CurriculumData } from "@/lib/curriculum-record";
import { I18nContext } from "@/lib/i18n-context";
import { buildCurriculum } from "../lib/curriculum-accumulator";
import { MAX_SUBJECTS, topicLevel } from "../lib/curriculum-edit";
import { useTutorActions } from "./use-tutor-actions";

const MATHS = { name: "Mathematics", slug: "mathematics" };
const CURRICULUM = buildCurriculum({
  country: "NG",
  language: "en",
  gradeLevel: "SS 2",
  subjects: [MATHS],
  topics: { mathematics: ["Quadratic Equations"] },
  nextSubjectSlug: "mathematics",
});

const REAL_ANALYSIS: AddedPath = {
  subject: "Real analysis",
  goal: "Real analysis",
  slug: "real-analysis",
  steps: [
    { title: "Limits", level: "SS 3" },
    { title: "Sequences", level: "Undergraduate" },
  ],
};
const QUANTUM: AddedPath = {
  subject: "Quantum computing",
  goal: "Quantum computing",
  slug: "quantum-computing",
  steps: [{ title: "Qubits", level: "Undergraduate" }],
};

const adding = (...paths: AddedPath[]): TutorAction => ({
  type: "add_paths",
  paths,
});

/** A write that settles when the test says so. */
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
    () => ({
      actions: useTutorActions({
        curriculum,
        applyCurriculum,
        regenerate,
        onDone,
        onFailure,
      }),
      location: useLocation(),
    }),
    { wrapper },
  );
  const actions = () => hook.result.current.actions;
  return { hook, actions, applyCurriculum, onDone, onFailure };
}

afterEach(cleanup);

describe("the courses the learner chose topics of on a path card", () => {
  it("adds each as its own subject with only the topics chosen, in order, with their levels", async () => {
    const { actions, applyCurriculum } = mount();

    await act(() => actions().carryOut([adding(REAL_ANALYSIS, QUANTUM)]));

    expect(applyCurriculum).toHaveBeenCalledOnce();
    const plan: CurriculumData = applyCurriculum.mock.calls[0][0];
    expect(plan.subjects.map((s) => s.name)).toEqual([
      "Mathematics",
      "Real analysis",
      "Quantum computing",
    ]);
    expect(plan.topics?.["real-analysis"]).toEqual(["Limits", "Sequences"]);
    expect(plan.topics?.["quantum-computing"]).toEqual(["Qubits"]);
    const analysis = plan.subjects[1];
    expect(topicLevel(plan, analysis, "Sequences")).toBe("Undergraduate");
    expect(plan.goals?.["real-analysis"]).toBe("Sequences");
  });

  it("keeps the slug the tutor made the lesson under, so the lesson is found again", async () => {
    const { actions, applyCurriculum } = mount();

    await act(() =>
      actions().carryOut([adding({ ...REAL_ANALYSIS, slug: "analysis-9" })]),
    );

    const plan: CurriculumData = applyCurriculum.mock.calls[0][0];
    expect(plan.subjects.at(-1)).toEqual({
      name: "Real analysis",
      slug: "analysis-9",
    });
  });

  it("takes another slug when the plan has taken the one named", async () => {
    const { actions, applyCurriculum } = mount();

    await act(() =>
      actions().carryOut([adding({ ...REAL_ANALYSIS, slug: "mathematics" })]),
    );

    const plan: CurriculumData = applyCurriculum.mock.calls[0][0];
    expect(plan.subjects.at(-1)?.slug).toBe("real-analysis");
  });

  it("tells the chat what was added in the app's words, offering sign-in to keep it, with no link and nowhere to go", async () => {
    const { hook, actions, onDone } = mount();

    await act(() => actions().carryOut([adding(REAL_ANALYSIS, QUANTUM)]));

    expect(onDone.mock.calls).toEqual([
      ["chat.pathAdded Real analysis", undefined, "keep"],
      ["chat.pathAdded Quantum computing", undefined, "keep"],
    ]);
    expect(hook.result.current.location.pathname).toBe("/");
  });

  it("does not show a card of its own: the learner's choice was the confirmation", async () => {
    const { actions } = mount();

    await act(() => actions().carryOut([adding(REAL_ANALYSIS)]));

    expect(actions().pendingPlanChange).toBeNull();
  });

  it("says a course is already there instead of saying it was added", async () => {
    const { actions, applyCurriculum, onDone } = mount();

    await act(() =>
      actions().carryOut([
        adding({ ...REAL_ANALYSIS, subject: "MATHEMATICS" }),
      ]),
    );

    expect(applyCurriculum).not.toHaveBeenCalled();
    expect(onDone.mock.calls.map(([message]) => message)).toEqual([
      "chat.pathExists Mathematics",
    ]);
  });

  it("says a course with no name was not added", async () => {
    const { actions, applyCurriculum, onFailure } = mount();

    await act(() =>
      actions().carryOut([
        adding({ ...REAL_ANALYSIS, subject: " ", goal: " " }),
      ]),
    );

    expect(applyCurriculum).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith("chat.pathUnnamed");
  });

  it("adds none beyond the most a plan holds, and says so", async () => {
    const full = {
      ...CURRICULUM,
      subjects: Array.from({ length: MAX_SUBJECTS }, (_, n) => ({
        name: `Subject ${n}`,
        slug: `subject-${n}`,
      })),
    };
    const { actions, applyCurriculum, onDone, onFailure } = mount(full);

    await act(() => actions().carryOut([adding(REAL_ANALYSIS, QUANTUM)]));

    expect(applyCurriculum).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(`chat.pathsFull ${MAX_SUBJECTS}`);
  });

  it("builds on the plan an earlier action of the reply left", async () => {
    const { actions, applyCurriculum } = mount();

    await act(() =>
      actions().carryOut([
        {
          type: "add_topic",
          subjectSlug: "mathematics",
          subject: "Mathematics",
          topic: "Surds",
        },
        adding(REAL_ANALYSIS),
      ]),
    );

    const plan: CurriculumData = applyCurriculum.mock.calls[1][0];
    expect(plan.topics?.mathematics).toEqual(["Quadratic Equations", "Surds"]);
    expect(plan.subjects.map((s) => s.name)).toContain("Real analysis");
  });
});

describe("a plan that could not be kept", () => {
  const surds = (topic: string): TutorAction => ({
    type: "add_topic",
    subjectSlug: "mathematics",
    subject: "Mathematics",
    topic,
  });

  it("is not what the next action builds on", async () => {
    const { actions, applyCurriculum } = mount();
    applyCurriculum.mockRejectedValueOnce(new Error("no room on this device"));

    await expect(
      act(() => actions().carryOut([surds("Surds")])),
    ).rejects.toThrow("no room");
    await act(() => actions().carryOut([surds("Indices")]));

    expect(applyCurriculum.mock.calls[1][0].topics.mathematics).toEqual([
      "Quadratic Equations",
      "Indices",
    ]);
  });

  it("does not leave the learner's choice half added: the next try builds on what was kept", async () => {
    const { actions, applyCurriculum } = mount();
    applyCurriculum.mockRejectedValueOnce(new Error("no room on this device"));

    await expect(
      act(() => actions().carryOut([adding(REAL_ANALYSIS)])),
    ).rejects.toThrow("no room");
    await act(() => actions().carryOut([adding(REAL_ANALYSIS)]));

    const plan: CurriculumData = applyCurriculum.mock.calls[1][0];
    expect(plan.subjects.map((s) => s.name)).toEqual([
      "Mathematics",
      "Real analysis",
    ]);
  });
});

describe("two writes that overlap", () => {
  function overlapping(
    first: "rejects" | "resolves",
    second: "rejects" | "resolves",
  ) {
    const { actions, applyCurriculum } = mount();
    const writes = [deferred<void>(), deferred<void>()];
    applyCurriculum
      .mockReturnValueOnce(writes[0].promise)
      .mockReturnValueOnce(writes[1].promise);
    const topic = (title: string): TutorAction => ({
      type: "add_topic",
      subjectSlug: "mathematics",
      subject: "Mathematics",
      topic: title,
    });
    const settle = async () => {
      await act(async () => {
        const a = actions()
          .carryOut([topic("Surds")])
          .catch(() => {});
        const b = actions()
          .carryOut([topic("Indices")])
          .catch(() => {});
        for (const [at, how] of [first, second].entries()) {
          if (how === "rejects") writes[at].reject(new Error("no room"));
          else writes[at].resolve();
        }
        await Promise.all([a, b]);
      });
    };
    return { actions, applyCurriculum, settle, topic };
  }

  it("builds on the later write when the earlier one failed", async () => {
    const { actions, applyCurriculum, settle, topic } = overlapping(
      "rejects",
      "resolves",
    );
    await settle();

    await act(() => actions().carryOut([topic("Cubes")]));

    expect(applyCurriculum.mock.calls[2][0].topics.mathematics).toContain(
      "Indices",
    );
  });

  it("builds on the plan that was kept when both failed", async () => {
    const { actions, applyCurriculum, settle, topic } = overlapping(
      "rejects",
      "rejects",
    );
    await settle();

    await act(() => actions().carryOut([topic("Cubes")]));

    expect(applyCurriculum.mock.calls[2][0].topics.mathematics).toEqual([
      "Quadratic Equations",
      "Cubes",
    ]);
  });
});

describe("two writing actions in one reply", () => {
  it("builds the second on the plan the first left", async () => {
    const { actions, applyCurriculum } = mount();

    await act(() =>
      actions().carryOut([
        {
          type: "add_topic",
          subjectSlug: "mathematics",
          subject: "Mathematics",
          topic: "Surds",
        },
        {
          type: "add_topic",
          subjectSlug: "mathematics",
          subject: "Mathematics",
          topic: "Indices",
        },
      ]),
    );

    expect(applyCurriculum).toHaveBeenCalledTimes(2);
    expect(applyCurriculum.mock.calls[1][0].topics.mathematics).toEqual([
      "Quadratic Equations",
      "Surds",
      "Indices",
    ]);
  });
});

describe("a change that clears progress", () => {
  it("waits for the learner's yes before a rebuild", async () => {
    const { actions } = mount();

    await act(() => actions().carryOut([{ type: "rebuild_plan" }]));

    expect(actions().pendingPlanChange).toEqual({ type: "rebuild_plan" });
  });
});
