// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const app = (page: ReactNode) => (
  <I18nContext.Provider
    value={{ locale: "en", setLocale: () => undefined, t: (key) => key }}
  >
    <MemoryRouter>{page}</MemoryRouter>
  </I18nContext.Provider>
);

afterEach(cleanup);

// Nothing on the sign-in screen sits in a card, so every colour token under the root must keep its
// light value in dark mode: `theme-light` pins them all, so no text turns pale on the pale ground.
describe("the sign-in screen's ground", () => {
  it("pins the light palette over the whole screen", () => {
    const { container } = render(app(<SignInPage />));
    const root = container.querySelector("main");
    expect(root?.classList.contains("art-ground")).toBe(true);
    expect(root?.classList.contains("theme-light")).toBe(true);
  });

  it("shows why a sign-in stopped in the screen's own ink", () => {
    render(app(<SignInPage />));
    const problem = screen.getByRole("alert");
    expect(problem.textContent).toBe("you.signInBlocked");
    expect(problem.classList.contains("text-on-art")).toBe(true);
    expect(problem.classList.contains("text-danger")).toBe(false);
  });
});
