// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import OnboardingLayout from "@/features/onboarding/components/onboarding-layout";
import { I18nContext } from "@/lib/i18n-context";
import SignInPage from "./sign-in-page";

vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  FIREBASE_CONFIG: {},
}));
vi.mock("@/lib/account/use-account", () => ({ useAccount: () => null }));
vi.mock("../hooks/use-google-sign-in", () => ({
  useGoogleSignIn: () => ({
    signIn: () => undefined,
    busy: false,
    problem: "popupBlocked",
  }),
}));

// These tokens change with the theme; the art screens' ground does not.
const THEMED_TEXT =
  /^(?:[a-z-]+:)*text-(?:ink|muted|subtle|faint|accent|accent-ink|danger|success|warning)$/;

/** Every class on an element that colours its text with a token that flips in dark mode. */
function themedText(root: Element): string[] {
  return [...root.querySelectorAll("*")].flatMap((element) =>
    [...element.classList]
      .filter((name) => THEMED_TEXT.test(name))
      .map((name) => `${element.tagName.toLowerCase()}.${name}`),
  );
}

const app = (page: ReactNode) => (
  <I18nContext.Provider
    value={{ locale: "en", setLocale: () => undefined, t: (key) => key }}
  >
    <MemoryRouter>{page}</MemoryRouter>
  </I18nContext.Provider>
);

afterEach(cleanup);

describe("text on the art screens' ground", () => {
  it("never uses a colour that changes with the theme on the sign-in screen", () => {
    const { container } = render(app(<SignInPage />));
    expect(container.querySelector("main")?.className).toContain("art-ground");
    expect(themedText(container)).toEqual([]);
  });

  it("never uses one on the onboarding screen outside the card", () => {
    const { container } = render(
      app(
        <OnboardingLayout band={null}>
          <p />
        </OnboardingLayout>,
      ),
    );
    container.querySelector(".rounded-sheet")?.remove();
    expect(container.querySelector(".art-ground")).toBeTruthy();
    expect(themedText(container)).toEqual([]);
  });
});
