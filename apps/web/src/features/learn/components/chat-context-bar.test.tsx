// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
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
    "has no sign-in link, for a visitor either (changeable: %s)",
    (changeable) => {
      bar("/app/learn/ask/general", changeable);

      expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    },
  );

  it("keeps the topic change on its own", () => {
    bar("/app/learn/ask/general", true);

    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
  });

  it("has none for a signed-in learner", () => {
    signedInAs({ id: "ada000000001", name: "Ada" });

    bar("/app/learn/ask/general", true);

    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});
