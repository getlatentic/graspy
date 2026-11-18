// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import { PlanContext } from "@/features/learn/learner-context";
import type { LearnerPlan } from "@/features/learn/hooks/use-learner-plan";
import { buildCurriculum } from "@/features/learn/lib/curriculum-accumulator";
import en from "@/locales/en.json";
import { PlanBuilding } from "./plan-building";

const t = (key: string, values?: Record<string, string | number>) =>
  Object.entries(values ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    key
      .split(".")
      .reduce<unknown>((value, part) => (value as never)?.[part], en) as string,
  );

function building(topics: Record<string, string[]>, priming = false) {
  const plan = {
    curriculum: buildCurriculum({
      country: "NG",
      language: "en",
      subjects: [
        { name: "Mathematics", slug: "mathematics" },
        { name: "English", slug: "english" },
      ],
      topics,
    }),
    isPrimingLesson: priming,
  } as unknown as LearnerPlan;
  render(
    <I18nContext.Provider
      value={{ t, locale: "en", setLocale: () => {} } as never}
    >
      <PlanContext.Provider value={plan}>
        <PlanBuilding />
      </PlanContext.Provider>
    </I18nContext.Provider>,
  );
  return within(screen.getByRole("list"));
}

afterEach(cleanup);

describe("PlanBuilding", () => {
  it("names the plan being made and says it can take a minute", () => {
    building({});
    expect(
      screen.getByRole("heading", { name: en.planBuilding.making }),
    ).toBeTruthy();
    expect(screen.getByText(en.onboarding.generating.wait)).toBeTruthy();
  });

  it("lists each subject, with its topics once they have come, and the first lesson last", () => {
    const rows = building({ mathematics: ["Fractions", "Algebra"] });
    const items = rows.getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual([
      "Mathematics2 topics",
      "English",
      en.planBuilding.lesson,
    ]);
  });

  it("says one topic in the singular", () => {
    const rows = building({ mathematics: ["Fractions"] });
    expect(rows.getByText(en.planBuilding.topic)).toBeTruthy();
  });
});
