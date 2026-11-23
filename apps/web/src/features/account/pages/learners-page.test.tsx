// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { SERVICE_NOTICE } from "@/lib/account/consent-notices";
import { KeysApp } from "@/test/keys-app";
import { parentSession } from "@/test/parent-session";
import { AGREED, listed, refused, signedInAs } from "@/test/account-session";

const {
  listLearners,
  renameLearner,
  agreeToService,
  signInAgain,
  deleteAccountAndSignOut,
  startParentSession,
} = vi.hoisted(() => ({
  listLearners: vi.fn(),
  renameLearner: vi.fn(),
  agreeToService: vi.fn(),
  signInAgain: vi.fn(),
  deleteAccountAndSignOut: vi.fn(),
  startParentSession: vi.fn(),
}));
vi.mock("@/lib/account/learners-api", () => ({
  listLearners,
  renameLearner,
  agreeToService,
}));
vi.mock("@/lib/account/parent-pin-api", async (original) => ({
  ...(await original<typeof import("@/lib/account/parent-pin-api")>()),
  getPinStatus: async () => ({
    hasPin: true,
    length: 6,
    lockedUntil: null,
    disabled: false,
  }),
}));
vi.mock("@/lib/account/learner-choice", () => ({ forgetLearner: vi.fn() }));
vi.mock("@/lib/api/session", async (original) => ({
  ...(await import("@/test/parent-session")).withParentSession(
    await original(),
  ),
  startParentSession,
}));
vi.mock("@/lib/account/sign-in", async (original) => ({
  ...(await original<typeof import("@/lib/account/sign-in")>()),
  prepareSignIn: () => undefined,
  signInAgain,
  deleteAccountAndSignOut,
}));

const { default: LearnersPage } = await import("./learners-page");

const ADA = listed("a00000000001", "Ada", AGREED);
const GRACE = listed("b00000000002", "Grace", null);

function manage() {
  render(
    <KeysApp>
      <LearnersPage />
    </KeysApp>,
  );
}

const rowOf = async (name: string) =>
  (await screen.findByText(name)).closest("li")!;

beforeEach(() => {
  vi.resetAllMocks();
  parentSession.reset();
  parentSession.grant();
  window.localStorage.clear();
  signedInAs({ id: ADA.id, name: "Ada" });
  listLearners.mockResolvedValue([ADA, GRACE]);
  signInAgain.mockResolvedValue("fresh-token");
  agreeToService.mockResolvedValue(AGREED);
});

afterEach(() => {
  cleanup();
  setAccount(null);
});

describe("managing the account's learners", () => {
  it("leads each learner to their voice recordings", async () => {
    manage();

    const link = within(await rowOf("Grace")).getByRole("link", {
      name: "learners.recordings",
    });

    expect(link.getAttribute("href")).toBe(
      "/app/learn/you/learners/b00000000002/voice",
    );
  });

  it("marks only the learner nobody has agreed for", async () => {
    manage();

    expect(
      within(await rowOf("Grace")).getByText("consent.needed"),
    ).toBeTruthy();
    expect(within(await rowOf("Ada")).queryByText("consent.needed")).toBeNull();
  });

  it("lets a parent agree for them, with the notice and the parent's session", async () => {
    manage();
    const grace = await rowOf("Grace");

    fireEvent.click(
      within(grace).getByRole("button", { name: "consent.agreeRow" }),
    );
    expect(await screen.findByText(SERVICE_NOTICE)).toBeTruthy();
    expect(agreeToService).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "consent.agree" }));

    await waitFor(() =>
      expect(
        within(screen.getByText("Grace").closest("li")!).queryByText(
          "consent.needed",
        ),
      ).toBeNull(),
    );
    expect(agreeToService).toHaveBeenCalledWith(GRACE.id, { noticeVersion: 1 });
  });

  it("leaves them marked when the server refuses the agreement", async () => {
    agreeToService.mockRejectedValueOnce(refused(503, "consent_not_kept"));
    manage();
    const grace = await rowOf("Grace");
    fireEvent.click(
      within(grace).getByRole("button", { name: "consent.agreeRow" }),
    );
    await screen.findByText(SERVICE_NOTICE);

    fireEvent.click(screen.getByRole("button", { name: "consent.agree" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "consent.notKept",
    );
  });

  it("leaves them marked when the parent declines", async () => {
    manage();
    const grace = await rowOf("Grace");
    fireEvent.click(
      within(grace).getByRole("button", { name: "consent.agreeRow" }),
    );
    await screen.findByText(SERVICE_NOTICE);

    fireEvent.click(screen.getByRole("button", { name: "consent.decline" }));

    expect(
      within(await rowOf("Grace")).getByText("consent.needed"),
    ).toBeTruthy();
    expect(agreeToService).not.toHaveBeenCalled();
  });

  it("keeps what a parent agreed to when a learner is renamed", async () => {
    renameLearner.mockResolvedValue({
      id: ADA.id,
      name: "Ada L.",
      createdAt: 1,
    });
    manage();
    const ada = await rowOf("Ada");

    fireEvent.click(
      within(ada).getByRole("button", { name: "learners.rename" }),
    );
    fireEvent.change(screen.getByLabelText("learners.nameLabel"), {
      target: { value: "Ada L." },
    });
    fireEvent.click(screen.getByRole("button", { name: "learners.save" }));

    const renamed = await rowOf("Ada L.");
    expect(within(renamed).queryByText("consent.needed")).toBeNull();
    expect(
      within(renamed).queryByRole("button", { name: "consent.agreeRow" }),
    ).toBeNull();
  });
});

describe("focus, for the keyboard and a screen reader", () => {
  it("moves into the question when removing a learner, and back to the button after", async () => {
    manage();
    const grace = await rowOf("Grace");
    const remove = within(grace).getByRole("button", {
      name: "learners.remove",
    });
    remove.focus();
    fireEvent.click(remove);

    expect(document.activeElement).toBe(await screen.findByRole("alertdialog"));

    fireEvent.click(screen.getByRole("button", { name: "learners.cancel" }));

    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(screen.getByText("Grace").closest("li")!).getByRole("button", {
          name: "learners.remove",
        }),
      ),
    );
  });
});

describe("deleting the account", () => {
  async function confirming() {
    manage();
    fireEvent.click(
      await screen.findByRole("button", { name: "learners.deleteButton" }),
    );
    await screen.findByRole("alertdialog");
  }

  it("says that Google is asked for once more, and asks nothing before it is confirmed", async () => {
    await confirming();

    expect(screen.getByRole("alertdialog").textContent).toContain(
      "learners.deleteGoogle",
    );
    expect(signInAgain).not.toHaveBeenCalled();
    expect(deleteAccountAndSignOut).not.toHaveBeenCalled();
  });

  it("is done under a Google sign-in just made, never the PIN, and not before it", async () => {
    signInAgain.mockResolvedValue("fresh-token");
    startParentSession.mockResolvedValue(undefined);
    deleteAccountAndSignOut.mockResolvedValue(undefined);
    await confirming();

    fireEvent.click(screen.getByRole("button", { name: "learners.deleteYes" }));

    await waitFor(() => expect(deleteAccountAndSignOut).toHaveBeenCalled());
    expect(startParentSession).toHaveBeenCalledWith("fresh-token");
    expect(signInAgain.mock.invocationCallOrder[0]).toBeLessThan(
      startParentSession.mock.invocationCallOrder[0],
    );
    expect(startParentSession.mock.invocationCallOrder[0]).toBeLessThan(
      deleteAccountAndSignOut.mock.invocationCallOrder[0],
    );
  });

  it("deletes nothing, and says nothing, when the parent closes Google's window", async () => {
    signInAgain.mockRejectedValue({ code: "auth/popup-closed-by-user" });
    await confirming();

    fireEvent.click(screen.getByRole("button", { name: "learners.deleteYes" }));

    await waitFor(() => expect(signInAgain).toHaveBeenCalled());
    expect(startParentSession).not.toHaveBeenCalled();
    expect(deleteAccountAndSignOut).not.toHaveBeenCalled();
    expect(screen.queryByText("learners.failed")).toBeNull();
  });

  it("says so when the sign-in does not hold, and deletes nothing", async () => {
    signInAgain.mockResolvedValue("stale-token");
    startParentSession.mockRejectedValue(refused(401, "sign_in_stale"));
    await confirming();

    fireEvent.click(screen.getByRole("button", { name: "learners.deleteYes" }));

    expect(await screen.findByText("learners.failed")).toBeTruthy();
    expect(deleteAccountAndSignOut).not.toHaveBeenCalled();
  });
});

describe("the learners are the parent's", () => {
  it("asks for the PIN, and shows no learner to rename or remove, until it is typed", async () => {
    parentSession.end();
    manage();

    await screen.findByRole("group", { name: "parentPin.title" });
    expect(screen.queryByText("Ada")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "learners.rename" }),
    ).toBeNull();
  });
});
