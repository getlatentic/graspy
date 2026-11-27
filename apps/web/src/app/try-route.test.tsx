// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { takeChat } from "@/lib/account/chat-return";
import { TRY_CHAT } from "@/features/learn/lib/chat-targets";
import { signedInAs } from "@/test/account-session";

const readyToChat = vi.fn<() => Promise<boolean>>();
vi.mock("@/features/learn/lib/start-chat", () => ({ readyToChat }));

const { routes } = await import("@/routes");

// The first visit to a route imports its page, which takes longer than the default five
// seconds on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

/** Where the loaders leave the router, as the browser router holds the routes. */
async function opened(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  await new Promise<void>((resolve) => {
    const settled = () =>
      router.state.initialized && router.state.navigation.state === "idle";
    if (settled()) return resolve();
    const stop = router.subscribe(() => {
      if (!settled()) return;
      stop();
      resolve();
    });
  });
  return router.state.location.pathname;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setAccount(null);
  readyToChat.mockReset();
  readyToChat.mockResolvedValue(true);
});
afterEach(cleanup);

describe("/try", () => {
  it("opens the one chat for a visitor who is not signed in, with no sign-in", async () => {
    expect(await opened("/try")).toBe("/app/learn/ask/general");

    expect(readyToChat).toHaveBeenCalledOnce();
    expect(takeChat()).toBeNull();
  });

  it("sends a visitor whose device could not be readied to the app, which makes the plan", async () => {
    readyToChat.mockResolvedValue(false);

    expect(await opened("/try")).toBe("/app");
  });

  it("leads a chat remembered at the old address, /app/learn/ask/try, to the chat, signed in or not", async () => {
    expect(await opened("/app/learn/ask/try")).toBe("/app/learn/ask/general");
  });

  it("opens the chat of a learner signed in, ready with no onboarding", async () => {
    signedInAs({ id: "ada000000001", name: "Ada" });

    expect(await opened("/try")).toBe("/app/learn/ask/general");

    expect(readyToChat).toHaveBeenCalledOnce();
    expect(takeChat()).toBeNull();
  });

  it("asks an account with no learner who is learning, and keeps the chat for after", async () => {
    signedInAs(null);

    expect(await opened("/try")).toBe("/app/learners");

    expect(readyToChat).not.toHaveBeenCalled();
    expect(takeChat()).toBe(TRY_CHAT);
  });

  it("does not open the chat when the learner's plan could not be fetched", async () => {
    signedInAs({ id: "ada000000001", name: "Ada" });
    readyToChat.mockResolvedValue(false);

    expect(await opened("/try")).toBe("/app");
  });
});

describe("/app", () => {
  it("still sends a new visitor to onboarding", async () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/app"] });
    render(<RouterProvider router={router} />);

    // The lazy page's first import is slow on a busy machine; waitFor's default is one second.
    await waitFor(
      () => expect(router.state.location.pathname).toBe("/app/onboarding"),
      { timeout: 20_000 },
    );
    expect(readyToChat).not.toHaveBeenCalled();
  });
});
