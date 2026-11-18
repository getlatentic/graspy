// @vitest-environment jsdom
import { createMemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { takeChat } from "@/lib/account/chat-return";
import { signedInAs } from "@/test/account-session";
import { CHAT_LINKS } from "./chat-link";
import { routes } from "./../routes";

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
  it.each([...CHAT_LINKS, ...CHATS])(
    "is sent to sign in from %s, with the chat kept to return to",
    async (path) => {
      expect(await opened(path)).toBe("/app/sign-in");

      expect(takeChat()).toBe(
        path === "/chat" || path === "/app/chat" ? "/app/learn/ask" : path,
      );
    },
  );

  it("keeps the question the link carried", async () => {
    await opened("/app/learn/ask/mathematics/2?x=1");

    expect(takeChat()).toBe("/app/learn/ask/mathematics/2?x=1");
  });

  it.each(["/app/learn/voice", "/app/learn/subjects", "/app/learn/you"])(
    "keeps %s, which is not the chat",
    async (path) => {
      expect(await opened(path)).toBe(path);
      expect(takeChat()).toBeNull();
    },
  );
});

describe("an account", () => {
  it("with no learner keeps the chat asked for, to start in once a learner is chosen", async () => {
    signedInAs(null);

    expect(await opened("/chat")).toBe("/app/learn/ask");
    expect(takeChat()).toBe("/app/learn/ask");
  });

  it.each([...CHAT_LINKS, ...CHATS])(
    "with a learner is not sent to sign in from %s",
    async (path) => {
      signedInAs({ id: "ada000000001", name: "Ada" });

      expect(await opened(path)).not.toBe("/app/sign-in");
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
