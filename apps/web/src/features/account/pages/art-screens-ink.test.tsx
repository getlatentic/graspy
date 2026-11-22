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
    problem: null,
  }),
}));

const app = (page: ReactNode) => (
  <I18nContext.Provider
    value={{ locale: "en", setLocale: () => undefined, t: (key) => key }}
  >
    <MemoryRouter>{page}</MemoryRouter>
  </I18nContext.Provider>
);

afterEach(cleanup);

// The form sits straight on the ground, so every colour token under the root must keep its light
// value in dark mode: `theme-light` pins them all, so no text can turn pale on the pale ground.
describe("the art screens' ground", () => {
  it("pins the light palette over the whole sign-in screen", () => {
    const { container } = render(app(<SignInPage />));
    const root = container.querySelector("main");
    expect(root?.classList.contains("art-ground")).toBe(true);
    expect(root?.classList.contains("theme-light")).toBe(true);
  });

  it("pins it over the whole onboarding form, with no card or picture", () => {
    const { container } = render(
      app(
        <OnboardingLayout>
          <p>form</p>
        </OnboardingLayout>,
      ),
    );
    const root = container.querySelector(".art-ground");
    expect(root?.classList.contains("theme-light")).toBe(true);
    expect(root?.textContent).toContain("form");
    expect(
      root?.querySelector("img[src*='scene'], img[src*='hero']"),
    ).toBeNull();
    expect(
      root?.querySelector(".bg-surface.shadow-lift, .rounded-sheet"),
    ).toBeNull();
  });
});
