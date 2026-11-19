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
  it("shows a drawn learner to a child and to a tween", () => {
    for (const age of [8, 12]) {
      hero(profile(`Standard 3, Kenya, age ${age}`));
      expect(document.querySelector("img")).not.toBeNull();
      cleanup();
    }
  });

  it("shows a teen a monogram of their name and no drawing", () => {
    signedInAs({ id: "ada000000001", name: "ada" });
    hero(profile("SS 2 (Senior Secondary), Nigeria, age 16"));
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("names the learner when an account gives a name, with the class beneath", () => {
    signedInAs({ id: "ada000000001", name: "Ada" });
    hero(profile("JSS 1, Nigeria, age 12"));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Ada");
  });

  it("leads with the class when no name is known", () => {
    hero(profile("JSS 1, Nigeria, age 12"));
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
    expect(screen.queryByText("Ada")).toBeNull();
  });
});
