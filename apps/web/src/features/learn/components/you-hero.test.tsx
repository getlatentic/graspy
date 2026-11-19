// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { I18nContext } from "@/lib/i18n-context";
import { learnerIn } from "@/test/learner";
import { signedInAs } from "@/test/account-session";
import type { UserProfile } from "@/lib/user-storage";
import { YouHero } from "./you-hero";

const profile = (gradeLevel: string): UserProfile => ({
  ...learnerIn("jss-1"),
  gradeLevel,
});

const hero = (p: UserProfile) =>
  render(
    <I18nContext.Provider
      value={
        { t: (key: string) => key, locale: "en", setLocale: () => {} } as never
      }
    >
      <YouHero profile={p} />
    </I18nContext.Provider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  setAccount(null);
});
afterEach(cleanup);

describe("YouHero", () => {
  it.each([8, 12])("shows a drawn learner at age %i", (age) => {
    hero(profile(`Standard 3, Kenya, age ${age}`));
    expect(document.querySelector("img")).not.toBeNull();
  });

  it("shows a teen a monogram of their name and no drawing", () => {
    signedInAs({ id: "ada000000001", name: "ada" });
    hero(profile("SS 2 (Senior Secondary), Nigeria, age 16"));
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("A")).toBeTruthy();
  });

  it.each([
    ["émile", "É"],
    ["😀 Ada", "😀"],
    ["ǆela", "Ǆ"],
  ])("takes the whole first letter of %s for the monogram", (name, initial) => {
    signedInAs({ id: "ada000000001", name });
    hero(profile("SS 2 (Senior Secondary), Nigeria, age 16"));
    expect(screen.getByText(initial)).toBeTruthy();
  });

  it("gives a teen with no name a person icon instead of a letter", () => {
    hero(profile("SS 2 (Senior Secondary), Nigeria, age 16"));
    expect(document.querySelector("svg")).not.toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });

  it("names the learner when an account gives a name, with the class beneath", () => {
    signedInAs({ id: "ada000000001", name: "Ada" });
    hero(profile("JSS 1, Nigeria, age 12"));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Ada");
    expect(screen.getByText("JSS 1, Nigeria, age 12")).toBeTruthy();
  });

  it("leads with the class when no name is known", () => {
    hero(profile("JSS 1, Nigeria, age 12"));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "JSS 1, Nigeria, age 12",
    );
  });
});
