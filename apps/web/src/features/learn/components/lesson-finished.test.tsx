// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { I18nContext } from "@/lib/i18n-context";
import { signedInAs } from "@/test/account-session";
import en from "@/locales/en.json";
import { LessonFinished } from "./lesson-finished";

vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  FIREBASE_CONFIG: { apiKey: "key" },
}));

const t = (key: string, values: Record<string, string> = {}) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, value),
    key
      .split(".")
      .reduce<unknown>((found, part) => (found as never)?.[part], en) as string,
  );

function finished() {
  render(
    <I18nContext.Provider
      value={{ t, locale: "en", setLocale: () => {} } as never}
    >
      <MemoryRouter initialEntries={["/app/learn/maths/lesson/1"]}>
        <LessonFinished
          topic="Fractions"
          subject="Maths"
          objectives={[]}
          next="Decimals"
          onNext={() => {}}
          onBack={() => {}}
        />
      </MemoryRouter>
    </I18nContext.Provider>,
  );
}

beforeEach(() => setAccount(null));
afterEach(cleanup);

describe("a lesson finished", () => {
  it("offers a visitor sign-in to keep it, beside the way on", () => {
    finished();

    expect(
      screen.getByText("Sign in to keep this and pick up on your phone"),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Start/ })).toBeTruthy();
  });

  it("offers a signed-in learner nothing of the kind", () => {
    signedInAs({ id: "ada000000001", name: "Ada" });

    finished();

    expect(screen.queryByText(/Sign in/)).toBeNull();
  });
});
