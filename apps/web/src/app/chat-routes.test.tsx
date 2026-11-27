// @vitest-environment jsdom
import { createMemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { takeChat } from "@/lib/account/chat-return";
import { signedInAs } from "@/test/account-session";
import { CHAT_LINKS } from "./chat-link";
import { routes } from "./../routes";

// The first visit to a route imports its page, which takes longer than the default five seconds
// on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

// The real routes, as the browser router holds them; only the history is in memory.
async function opened(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  router.initialize();
  await new Promise<void>((resolve) => {
    if (router.state.initialized && router.state.navigation.state === "idle") {
      resolve();
      return;
    }
    const stop = router.subscribe((state) => {
      if (state.initialized && state.navigation.state === "idle") {
        stop();
        resolve();
      }
    });
  });
  return router.state.location.pathname;
}

const CHATS = [
  "/app/learn/ask",
  "/app/learn/ask/general",
  "/app/learn/ask/subject/mathematics",
  "/app/learn/ask/mathematics/2",
];

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  setAccount(null);
});

describe("a visitor who is not signed in", () => {
  it.each(CHATS)("keeps %s, with no sign-in asked for", async (path) => {
    expect(await opened(path)).toBe(path);
    expect(takeChat()).toBeNull();
  });

  it.each(CHAT_LINKS)("is led by %s to the chat", async (path) => {
    expect(await opened(path)).toBe("/app/learn/ask");
  });
});

describe("an account", () => {
  it.each([...CHAT_LINKS, ...CHATS])(
    "with a learner reaches the chat from %s",
    async (path) => {
      signedInAs({ id: "ada000000001", name: "Ada" });

      expect(await opened(path)).toMatch(/^\/app\/learn\/ask/);
      expect(takeChat()).toBeNull();
    },
  );
});

describe("the short links", () => {
  it("are /chat and /app/chat, one definition leading to the one chat", async () => {
    expect(CHAT_LINKS).toEqual(["/chat", "/app/chat"]);
    signedInAs({ id: "ada000000001", name: "Ada" });

    expect(await opened("/chat")).toBe(await opened("/app/chat"));
  });
});
