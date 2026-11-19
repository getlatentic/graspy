// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";
import { SignIn } from "./sign-in-page";

vi.mock("../hooks/use-google-sign-in", () => ({
  useGoogleSignIn: () => ({
    signIn: () => undefined,
    busy: false,
    problem: null,
  }),
}));

const t = (key: string) =>
  key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en) as string;

afterEach(cleanup);

describe("the sign-in card", () => {
  const card = () =>
    render(
      <MemoryRouter>
        <I18nContext.Provider
          value={{ t, locale: "en", setLocale: () => {} } as never}
        >
          <SignIn />
        </I18nContext.Provider>
      </MemoryRouter>,
    );

  it("asks one question and says what each way in does", () => {
    card();
    expect(screen.getByRole("heading", { name: en.signIn.ready })).toBeTruthy();
    expect(screen.getByText(en.signIn.explain)).toBeTruthy();
  });

  it("puts Google's own mark in the button", () => {
    card();
    const button = screen.getByRole("button", { name: en.you.signIn });
    expect(button.querySelector("svg path[fill='#4285F4']")).toBeTruthy();
  });

  it("offers to start without an account as a second button that opens the app", () => {
    card();
    const link = screen.getByRole("link", { name: en.signIn.start });
    expect(link.getAttribute("href")).toBe("/app");
    expect(link.className).toContain("border-accent");
  });

  it("keeps both labels on one line down to a phone of 320px", () => {
    card();
    const button = screen.getByRole("button", { name: en.you.signIn });
    const link = screen.getByRole("link", { name: en.signIn.start });
    for (const control of [button, link]) {
      expect(control.className).toContain("whitespace-nowrap");
      expect(control.className).toContain("px-3");
    }
    expect(button.querySelector("span")?.className).toContain("shrink-0");
  });
});
