// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import { PlanContext } from "@/features/learn/learner-context";
import type { LearnerPlan } from "@/features/learn/hooks/use-learner-plan";
import { buildCurriculum } from "@/features/learn/lib/curriculum-accumulator";
import type { CurriculumData } from "@/lib/curriculum-record";
import en from "@/locales/en.json";
import { PlanBuilding } from "./plan-building";

// A message the app does not have is a failure here, not an empty string.
const t = (key: string, values?: Record<string, string | number>) => {
  const message = key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en);
  if (typeof message !== "string") throw new Error(`no message ${key}`);
  return Object.entries(values ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    message,
  );
};

const plan = (topics: Record<string, string[]>, named = true) =>
  buildCurriculum({
    country: "NG",
    language: "en",
    subjects: named
      ? [
          { name: "Mathematics", slug: "mathematics" },
          { name: "English", slug: "english" },
        ]
      : [],
    topics,
  });

const inApp = (curriculum: CurriculumData) => (
  <I18nContext.Provider
    value={{ t, locale: "en", setLocale: () => {} } as never}
  >
    <PlanContext.Provider value={{ curriculum } as unknown as LearnerPlan}>
      <PlanBuilding />
    </PlanContext.Provider>
  </I18nContext.Provider>
);

const rows = () =>
  screen.getAllByRole("listitem").map((item) => ({
    text: item.textContent,
    state: item.getAttribute("data-state"),
  }));

afterEach(cleanup);

describe("PlanBuilding", () => {
  it("says it can take a minute", () => {
    render(inApp(plan({})));
    expect(screen.getByText(en.onboarding.generating.wait)).toBeTruthy();
  });

  it("is the choosing of subjects before the plan names one", () => {
    render(inApp(plan({}, false)));
    expect(rows()).toEqual([
      {
        text: `${en.planBuilding.choosing}${en.planBuilding.working}`,
        state: "working",
      },
    ]);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("lists each subject with what it is doing", () => {
    render(inApp(plan({ mathematics: ["Fractions", "Algebra"] })));
    expect(rows()).toEqual([
      { text: "Mathematics2 topicsDone", state: "done" },
      { text: "EnglishIn progress", state: "working" },
    ]);
  });

  it("says one topic in the singular", () => {
    render(inApp(plan({ mathematics: ["Fractions"] })));
    expect(rows()[0].text).toBe("Mathematics1 topicDone");
  });

  it("tells a screen reader how many subjects are ready, and again as more come", () => {
    const view = render(inApp(plan({})));
    expect(screen.getByRole("status").textContent).toBe(
      "0 of 2 subjects ready",
    );
    view.rerender(inApp(plan({ mathematics: ["Fractions"] })));
    expect(screen.getByRole("status").textContent).toBe(
      "1 of 2 subjects ready",
    );
    expect(rows().map((row) => row.state)).toEqual(["done", "working"]);
  });
});
