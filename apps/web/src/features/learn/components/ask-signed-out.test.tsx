// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { I18nContext } from "@/lib/i18n-context";
import { signedInAs } from "@/test/account-session";
import en from "@/locales/en.json";
import { AppTabBar } from "./app-tab-bar";
import { SideNav } from "./side-nav";
import { TutorAskBar } from "./tutor-ask-bar";
import { SECTIONS } from "@/features/learn/lib/app-sections";

const t = (key: string) =>
  key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en) as string;

function shown(children: React.ReactNode) {
  render(
    <I18nContext.Provider
      value={{ t, locale: "en", setLocale: () => {} } as never}
    >
      <MemoryRouter>{children}</MemoryRouter>
    </I18nContext.Provider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  setAccount(null);
});
afterEach(cleanup);

describe("while nobody is signed in", () => {
  it("the ask bar says to sign in", () => {
    shown(<TutorAskBar busy={false} unread={false} onOpen={() => {}} />);

    expect(screen.getByRole("button").textContent).toBe(
      "Sign in to ask graspy",
    );
  });

  it("the Ask tab and the side menu's Ask say Sign in, and lead to the chat's sign-in", () => {
    shown(
      <>
        <AppTabBar />
        <SideNav sections={SECTIONS} open onToggle={() => {}} />
      </>,
    );

    const asks = screen
      .getAllByRole("link", { name: "Sign in" })
      .map((link) => link.getAttribute("href"));
    expect(asks).toEqual(["/app/learn/ask", "/app/learn/ask"]);
    expect(screen.queryByRole("link", { name: "Ask" })).toBeNull();
  });
});

describe("for a signed-in learner", () => {
  beforeEach(() => signedInAs({ id: "ada000000001", name: "Ada" }));

  it("the ask bar and the Ask tab ask graspy", () => {
    shown(
      <>
        <TutorAskBar busy={false} unread={false} onOpen={() => {}} />
        <AppTabBar />
      </>,
    );

    expect(screen.getByRole("button").textContent).toBe("Ask graspy");
    expect(screen.getByRole("link", { name: "Ask" })).toBeTruthy();
  });
});
