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
import TopMenu from "./top-menu";

vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  FIREBASE_CONFIG: { apiKey: "key" },
}));

const t = (key: string) =>
  key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en) as string;

function menu(path: string) {
  render(
    <I18nContext.Provider
      value={{ t, locale: "en", setLocale: () => {} } as never}
    >
      <MemoryRouter initialEntries={[path]}>
        <TopMenu />
      </MemoryRouter>
    </I18nContext.Provider>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  setAccount(null);
});
afterEach(cleanup);

describe("the top bar", () => {
  it("offers sign-in as a button-styled link to a visitor", () => {
    menu("/app/learn/ask/general");

    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe("/app/sign-in");
    expect(link.className).toContain("border-accent-line");
  });

  it.each(["/app/learn/ask/mathematics/2", "/app/learn/mathematics/lesson/2"])(
    "brings the visitor back to %s",
    async (path) => {
      menu(path);

      await userEvent.click(screen.getByRole("link", { name: "Sign in" }));

      expect(takeChat()).toBe(path);
    },
  );

  it("has none for a signed-in learner", () => {
    signedInAs({ id: "ada000000001", name: "Ada" });

    menu("/app/learn/ask/general");

    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});
