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

  it("centres its heading and the line under the button, as the button's own label is", () => {
    card();
    expect(
      screen.getByRole("heading", { name: en.signIn.title }).className,
    ).toContain("text-center");
    const line = screen.getByRole("link", {
      name: en.signIn.start,
    }).parentElement!;
    expect(line.className).toContain("text-center");
  });

  it("keeps the button's icon and the blue link to start learning", () => {
    card();
    const button = screen.getByRole("button", { name: en.you.signIn });
    expect(button.querySelector("svg")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: en.signIn.start }).className,
    ).toContain("text-accent-ink");
    expect(
      screen.getByRole("link", { name: en.signIn.start }).getAttribute("href"),
    ).toBe("/app");
  });
});
