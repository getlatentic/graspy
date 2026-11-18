// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { I18nContext } from "@/lib/i18n-context";
import { learnerIn } from "@/test/learner";
import { signedInAs } from "@/test/account-session";
import type { UserProfile } from "@/lib/user-storage";
import en from "@/locales/en.json";
import { WelcomeLine } from "./welcome-line";

const { shown } = vi.hoisted(() => ({
  shown: { profile: null as UserProfile | null },
}));
vi.mock("@/lib/use-user-profile", () => ({
  useUserProfile: () => shown.profile,
}));

const t = (key: string, values?: Record<string, string | number>) => {
  const message = key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en);
  if (typeof message !== "string") return key;
  return Object.entries(values ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    message,
  );
};

const welcome = () =>
  render(
    <I18nContext.Provider
      value={{ t, locale: "en", setLocale: () => {} } as never}
    >
      <WelcomeLine />
    </I18nContext.Provider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  setAccount(null);
  shown.profile = { ...learnerIn("jss-1"), gradeLevel: "JSS 1" };
});
afterEach(cleanup);

describe("WelcomeLine", () => {
  it("greets the learner by name and says whose plan is being made", () => {
    signedInAs({ id: "ada000000001", name: "Ada" });
    welcome();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Welcome, \u2068Ada\u2069",
    );
    expect(screen.getByText("We're making your JSS 1 plan.")).toBeTruthy();
  });

  it("greets without a name when the device has no learner chosen", () => {
    welcome();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Welcome",
    );
  });

  it("says nothing about a class it does not know", () => {
    shown.profile = null;
    signedInAs({ id: "ada000000001", name: "Ada" });
    welcome();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Welcome, \u2068Ada\u2069",
    );
    expect(screen.queryByText(/plan\./)).toBeNull();
  });

  it("greets a learner whose name is only spaces as it greets one with none", () => {
    signedInAs({ id: "ada000000001", name: "   " });
    welcome();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Welcome",
    );
  });

  it("keeps a name written right to left apart from the words around it", () => {
    signedInAs({ id: "maryam00001", name: "مريم" });
    welcome();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Welcome, \u2068مريم\u2069",
    );
  });

  it("leaves out the class line when the class has no name", () => {
    shown.profile = { ...learnerIn("jss-1"), gradeLevel: "  " };
    signedInAs({ id: "ada000000001", name: "Ada" });
    welcome();
    expect(screen.queryByText(/We're making/)).toBeNull();
  });

  it("keeps the whole of a long name for a pointer to show", () => {
    const long = "A".repeat(100);
    signedInAs({ id: "ada000000001", name: long });
    welcome();
    expect(screen.getByRole("heading", { level: 1 }).title).toContain(long);
  });
});
