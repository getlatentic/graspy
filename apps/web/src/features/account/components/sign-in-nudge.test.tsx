// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { takeChat } from "@/lib/account/chat-return";
import { I18nContext } from "@/lib/i18n-context";
import { signedInAs } from "@/test/account-session";
import en from "@/locales/en.json";
import { SignInHere, SignInNudge } from "./sign-in-nudge";

let firebase: { apiKey: string } | null = { apiKey: "key" };
vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  get FIREBASE_CONFIG() {
    return firebase;
  },
}));

const t = (key: string) =>
  key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en) as string;

function shown(path: string, children: React.ReactNode) {
  render(
    <I18nContext.Provider
      value={{ t, locale: "en", setLocale: () => {} } as never}
    >
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </I18nContext.Provider>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  setAccount(null);
  firebase = { apiKey: "key" };
});
afterEach(cleanup);

describe("the sign-in nudge", () => {
  it("says why and offers sign-in to someone who has not signed in", () => {
    shown(
      "/app/learn/maths/lesson/2",
      <SignInNudge message="Sign in to keep this" />,
    );

    expect(screen.getByText("Sign in to keep this")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
    ).toBe("/app/sign-in");
  });

  it("is a button alone when there is nothing to say", () => {
    shown("/app/learn/ask/general", <SignInNudge />);

    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });

  it("shows nothing once signed in", () => {
    signedInAs({ id: "ada000000001", name: "Ada" });

    shown("/app/learn/ask/general", <SignInNudge message="Sign in" />);

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows nothing where sign-in is not set up", () => {
    firebase = null;

    shown("/app/learn/ask/general", <SignInNudge message="Sign in" />);

    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("signing in from where the visitor is", () => {
  it.each([
    "/app/learn/ask/general",
    "/app/learn/ask/mathematics/2?draft=1",
    "/app/learn/mathematics/lesson/2",
  ])("brings them back to %s", async (path) => {
    shown(path, <SignInHere />);

    await userEvent.click(screen.getByRole("link", { name: "Sign in" }));

    expect(takeChat()).toBe(path);
  });

  it("keeps nothing for a page that is not a chat or a lesson", async () => {
    shown("/app/learn/subjects", <SignInHere />);

    await userEvent.click(screen.getByRole("link", { name: "Sign in" }));

    expect(takeChat()).toBeNull();
  });
});
