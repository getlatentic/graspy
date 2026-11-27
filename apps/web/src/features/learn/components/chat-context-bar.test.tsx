// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { takeChat } from "@/lib/account/chat-return";
import type { ThreadScope } from "@/lib/chat-db";
import { I18nContext } from "@/lib/i18n-context";
import { signedInAs } from "@/test/account-session";
import en from "@/locales/en.json";
import { ChatContextBar } from "./chat-context-bar";

vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  FIREBASE_CONFIG: { apiKey: "key" },
}));
vi.mock("../learner-context", () => ({
  usePlan: () => ({ curriculum: null }),
}));
vi.mock("@/features/learn/components/chat-directory", () => ({
  ChatDirectory: () => null,
}));

const t = (key: string) =>
  key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en) as string;

const GENERAL: ThreadScope = { kind: "general", planId: "plan-1" };

function bar(path: string, changeable: boolean) {
  render(
    <I18nContext.Provider
      value={{ t, locale: "en", setLocale: () => {} } as never}
    >
      <MemoryRouter initialEntries={[path]}>
        <ChatContextBar
          scope={GENERAL}
          changeable={changeable}
          trailing={<button>Hide</button>}
        />
      </MemoryRouter>
    </I18nContext.Provider>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  setAccount(null);
});
afterEach(cleanup);

describe("the chat's header", () => {
  it.each([true, false])(
    "has a sign-in link for a visitor, in the same place before any control at its end (changeable: %s)",
    (changeable) => {
      bar("/app/learn/ask/general", changeable);

      const link = screen.getByRole("link", { name: "Sign in" });
      const hide = screen.getByRole("button", { name: "Hide" });
      expect(
        link.compareDocumentPosition(hide) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );

  it("brings the visitor back to the lesson whose chat it is beside", async () => {
    bar("/app/learn/mathematics/lesson/2", false);

    await userEvent.click(screen.getByRole("link", { name: "Sign in" }));

    expect(takeChat()).toBe("/app/learn/mathematics/lesson/2");
  });

  it("brings the visitor back to the topic chat it is in", async () => {
    bar("/app/learn/ask/mathematics/2", true);

    await userEvent.click(screen.getByRole("link", { name: "Sign in" }));

    expect(takeChat()).toBe("/app/learn/ask/mathematics/2");
  });

  it("has none for a signed-in learner", () => {
    signedInAs({ id: "ada000000001", name: "Ada" });

    bar("/app/learn/ask/general", true);

    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});
