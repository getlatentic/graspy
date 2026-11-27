// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { takeChat } from "@/lib/account/chat-return";
import { useLearnerChosen } from "./use-learner-chosen";

vi.mock("@/lib/account/learner-choice", () => ({
  leaveForGood: async () => {},
}));

function Probe() {
  return <p>{useLearnerChosen() ? "chosen" : "not chosen"}</p>;
}

function visit(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/app/learn/*", element: <Probe /> },
      { path: "/app/learners", element: <p>who is learning</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  window.sessionStorage.clear();
  setAccount(null);
});
afterEach(cleanup);

describe("the learner pages", () => {
  it("are open to a visitor who is not signed in", () => {
    visit("/app/learn/ask/general");

    expect(screen.getByText("chosen")).toBeTruthy();
    expect(takeChat()).toBeNull();
  });

  it.each([
    "/app/learn/ask/mathematics/2?x=1",
    "/app/learn/mathematics/lesson/2",
  ])(
    "ask an account with no learner who is learning, and keep %s for after",
    async (path) => {
      setAccount({
        uid: "uid-1",
        name: "Tunde",
        email: null,
        learner: null,
        deviceJoins: true,
      });

      visit(path);

      expect(await screen.findByText("who is learning")).toBeTruthy();
      expect(takeChat()).toBe(path);
    },
  );
});
