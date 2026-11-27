// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { signedInAs } from "@/test/account-session";
import type { ChatMessage } from "@/lib/chat-db";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";
import { ChatMessageItem } from "./chat-message";

vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  FIREBASE_CONFIG: { apiKey: "key" },
}));

const user = (content: string): ChatMessage => ({
  id: "m1",
  threadId: "t",
  type: "user",
  content,
  timestamp: 1,
  sender: "user",
});

function shown(message: ChatMessage) {
  render(
    <MemoryRouter>
      <I18nContext.Provider
        value={
          {
            t: (key: string, values: Record<string, string | number> = {}) =>
              Object.entries(values).reduce(
                (text, [name, value]) =>
                  text.replace(`{${name}}`, String(value)),
                (key
                  .split(".")
                  .reduce<unknown>(
                    (found, part) => (found as never)?.[part],
                    en,
                  ) as string | undefined) ?? key,
              ),
          } as unknown as React.ContextType<typeof I18nContext>
        }
      >
        <ChatMessageItem message={message} />
      </I18nContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => setAccount(null));
afterEach(cleanup);

describe("the learner's messages", () => {
  it("show the answer to a path card as the courses and the count, not every topic", () => {
    shown(
      user(
        "Add to my plan:\nCourse: Real analysis\n- Limits | SS 3\n- Series | SS 4",
      ),
    );

    expect(screen.getByText("Add to my plan: Real analysis (2)")).toBeTruthy();
    expect(screen.queryByText(/Limits/)).toBeNull();
  });

  it("show anything else as it was written", () => {
    shown(user("Add to my plan: real analysis"));

    expect(screen.getByText("Add to my plan: real analysis")).toBeTruthy();
  });
});

const note = (signInOffer?: "keep" | "continue"): ChatMessage => ({
  id: "m2",
  threadId: "t",
  type: "complete",
  content: "Added Real analysis to your path",
  timestamp: 1,
  sender: "ai",
  metadata: signInOffer ? { signInOffer } : undefined,
});

describe("what is added to a visitor's path", () => {
  it("offers sign-in to keep it", () => {
    shown(note("keep"));

    expect(screen.getByText(/Sign in to keep this/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });

  it("offers nothing to a signed-in learner, or where nothing was offered", () => {
    signedInAs({ id: "ada000000001", name: "Ada" });
    shown(note("keep"));
    cleanup();
    setAccount(null);
    shown(note());

    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});

describe("the refusal of a visitor past the limits", () => {
  it("is a button to sign in, not a dead end", () => {
    shown({
      ...note("continue"),
      type: "error",
      content: "Sign in to keep going.",
    });

    expect(screen.getByRole("alert").textContent).toBe(
      "Sign in to keep going.",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });

  it("is only the words for any other failure", () => {
    shown({ ...note(), type: "error", content: "Something went wrong." });

    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});
