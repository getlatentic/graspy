// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";
import { SubjectHeader } from "./subject-header";

const SOURCE = {
  packageId: "ai.graspy.curriculum.ng.nerdc.jss1.mathematics",
  packageRevision: 2,
  authority: "NERDC",
  title: "Mathematics · JSS 1",
  edition: "September 2025",
};

function shown(props: Parameters<typeof SubjectHeader>[0]) {
  render(
    <I18nContext.Provider
      value={
        {
          t: (key: string, values?: Record<string, string>) =>
            ((en.subject as Record<string, string>)[key.split(".")[1]] ?? "")
              .replace("{authority}", values?.authority ?? "")
              .replace("{edition}", values?.edition ?? ""),
        } as unknown as React.ContextType<typeof I18nContext>
      }
    >
      <SubjectHeader {...props} />
    </I18nContext.Provider>,
  );
  return screen.getByRole("banner").textContent;
}

afterEach(cleanup);

describe("SubjectHeader", () => {
  it("names the official curriculum a subject follows", () => {
    const text = shown({
      name: "Mathematics",
      source: SOURCE,
      onBack: () => {},
    });

    expect(text).toContain("Follows the NERDC curriculum, September 2025");
    expect(text).not.toContain(en.subject.modelWritten);
  });

  it("says a subject the tutor planned follows no official curriculum", () => {
    const text = shown({
      name: "Basic Science",
      modelWritten: true,
      onBack: () => {},
    });

    expect(text).toContain(en.subject.modelWritten);
  });

  it("says nothing about where topics come from while the plan is loading", () => {
    const text = shown({ name: "mathematics", onBack: () => {} });

    expect(text).not.toContain(en.subject.modelWritten);
    expect(text).not.toContain("Follows");
  });
});
