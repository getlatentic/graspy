// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { SERVICE_NOTICE } from "@/lib/account/consent-notices";
import { KeysApp } from "@/test/keys-app";
import {
  AGREED,
  listed,
  refused,
  signedInAs,
  WINDOW_CLOSED,
} from "@/test/account-session";

const { listLearners, addLearner, agreeToService, signInAgain, chooseLearner } =
  vi.hoisted(() => ({
    listLearners: vi.fn(),
    addLearner: vi.fn(),
    agreeToService: vi.fn(),
    signInAgain: vi.fn(),
    chooseLearner: vi.fn(),
  }));
vi.mock("@/lib/account/learners-api", () => ({
  listLearners,
  addLearner,
  agreeToService,
}));
vi.mock("@/lib/account/learner-choice", () => ({
  chooseLearner,
  UnsentChanges: class extends Error {},
}));
vi.mock("@/lib/account/sign-in", async (original) => ({
  ...(await original<typeof import("@/lib/account/sign-in")>()),
  prepareSignIn: () => undefined,
  signInAgain,
}));
vi.mock("../hooks/use-device-plan", () => ({
  useDeviceHoldsPlan: () => false,
}));

const { default: LearnerPickerPage } = await import("./learner-picker-page");

const ADA = listed("a00000000001", "Ada", AGREED);
const GRACE = listed("b00000000002", "Grace", null);

function picker() {
  render(
    <KeysApp>
      <LearnerPickerPage />
    </KeysApp>,
  );
}

const tap = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

async function untilListed(name: string) {
  await screen.findByRole("button", { name });
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  signedInAs(null);
  listLearners.mockResolvedValue([ADA, GRACE]);
  // A page to move to that a test can leave: only a change of hash is a move in jsdom.
  chooseLearner.mockResolvedValue("#opened");
  signInAgain.mockResolvedValue("fresh-token");
  agreeToService.mockResolvedValue(AGREED);
});

afterEach(() => {
  cleanup();
  setAccount(null);
});

describe("choosing a learner a parent has agreed for", () => {
  it("opens them without asking again", async () => {
    picker();
    await untilListed("Ada");

    tap("Ada");

    await waitFor(() => expect(chooseLearner).toHaveBeenCalled());
    expect(chooseLearner.mock.calls[0][0]).toMatchObject({ id: ADA.id });
    expect(signInAgain).not.toHaveBeenCalled();
  });
});

describe("choosing a learner nobody has agreed for", () => {
  async function chosen() {
    picker();
    await untilListed("Grace");
    tap("Grace");
    await screen.findByText(SERVICE_NOTICE);
  }

  it("shows the notice as the API gives it, and asks nothing of Google yet", async () => {
    await chosen();

    expect(screen.getByRole("heading").textContent).toBe(
      "consent.serviceTitle Grace",
    );
    expect(signInAgain).not.toHaveBeenCalled();
    expect(agreeToService).not.toHaveBeenCalled();
    expect(chooseLearner).not.toHaveBeenCalled();
  });

  it("opens them once the parent has signed in again and agreed, with the fresh sign-in", async () => {
    await chosen();

    tap("consent.agree");

    await waitFor(() => expect(chooseLearner).toHaveBeenCalled());
    expect(agreeToService).toHaveBeenCalledWith(GRACE.id, {
      noticeVersion: 1,
      firebaseIdToken: "fresh-token",
    });
    expect(chooseLearner.mock.calls[0][0]).toMatchObject({ id: GRACE.id });
    expect(signInAgain.mock.invocationCallOrder[0]).toBeLessThan(
      agreeToService.mock.invocationCallOrder[0],
    );
    expect(agreeToService.mock.invocationCallOrder[0]).toBeLessThan(
      chooseLearner.mock.invocationCallOrder[0],
    );
  });

  it("does not agree for a parent who did not sign in again", async () => {
    signInAgain.mockRejectedValueOnce(WINDOW_CLOSED);
    await chosen();

    tap("consent.agree");

    await waitFor(() => expect(signInAgain).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "consent.agree",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(agreeToService).not.toHaveBeenCalled();
    expect(chooseLearner).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("leaves them unusable for a parent who declines", async () => {
    await chosen();

    tap("consent.decline");

    await untilListed("Grace");
    expect(screen.queryByText(SERVICE_NOTICE)).toBeNull();
    expect(signInAgain).not.toHaveBeenCalled();
    expect(agreeToService).not.toHaveBeenCalled();
    expect(chooseLearner).not.toHaveBeenCalled();
  });

  it.each([
    [401, "sign_in_stale", "consent.signIn"],
    [401, "sign_in_invalid", "consent.signIn"],
    [403, "sign_in_other_account", "consent.otherAccount"],
    [400, "notice_unknown", "consent.notice"],
    [503, "consent_unavailable", "learners.failed"],
  ])(
    "asks to try again when the server refuses with %i %s, and opens them on the next try",
    async (status, code, message) => {
      agreeToService.mockRejectedValueOnce(refused(status, code));
      await chosen();

      tap("consent.agree");

      expect((await screen.findByRole("alert")).textContent).toBe(message);
      expect(chooseLearner).not.toHaveBeenCalled();

      tap("consent.agree");

      await waitFor(() => expect(chooseLearner).toHaveBeenCalled());
      expect(agreeToService).toHaveBeenCalledTimes(2);
    },
  );

  it("tells a parent who signed in with another Google account to use the one signed in", async () => {
    signInAgain.mockRejectedValueOnce({ code: "auth/user-mismatch" });
    await chosen();

    tap("consent.agree");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "consent.otherAccount",
    );
    expect(agreeToService).not.toHaveBeenCalled();
  });
});

describe("adding a learner", () => {
  async function named(name: string) {
    picker();
    await untilListed("learners.addTile");
    tap("learners.addTile");
    fireEvent.change(screen.getByLabelText("learners.nameLabel"), {
      target: { value: name },
    });
    tap("consent.continue");
    await screen.findByText(SERVICE_NOTICE);
  }

  it("sends the parent's agreement, with the fresh sign-in, with the learner", async () => {
    addLearner.mockResolvedValue(listed("c00000000003", "Tolu", AGREED));
    await named("Tolu");

    expect(addLearner).not.toHaveBeenCalled();
    tap("consent.agree");

    await waitFor(() => expect(chooseLearner).toHaveBeenCalled());
    expect(addLearner).toHaveBeenCalledWith("Tolu", {
      noticeVersion: 1,
      firebaseIdToken: "fresh-token",
    });
    expect(chooseLearner.mock.calls[0][0]).toMatchObject({
      id: "c00000000003",
    });
  });

  it("does not add the learner for a parent who declines", async () => {
    await named("Tolu");

    tap("consent.decline");

    await untilListed("learners.addTile");
    expect(addLearner).not.toHaveBeenCalled();
    expect(signInAgain).not.toHaveBeenCalled();
  });

  it("does not add the learner for a parent who did not sign in again", async () => {
    signInAgain.mockRejectedValueOnce(WINDOW_CLOSED);
    await named("Tolu");

    tap("consent.agree");

    await waitFor(() => expect(signInAgain).toHaveBeenCalled());
    expect(addLearner).not.toHaveBeenCalled();
    expect(chooseLearner).not.toHaveBeenCalled();
  });

  it("asks to try again when the server calls the sign-in stale, and adds them on the next try", async () => {
    addLearner
      .mockRejectedValueOnce(refused(401, "sign_in_stale"))
      .mockResolvedValueOnce(listed("c00000000003", "Tolu", AGREED));
    await named("Tolu");

    tap("consent.agree");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "consent.signIn",
    );
    expect(chooseLearner).not.toHaveBeenCalled();

    tap("consent.agree");

    await waitFor(() => expect(chooseLearner).toHaveBeenCalled());
    expect(addLearner).toHaveBeenCalledTimes(2);
  });

  it("asks to reload when the server does not know the notice", async () => {
    addLearner.mockRejectedValueOnce(refused(400, "notice_unknown"));
    await named("Tolu");

    tap("consent.agree");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "consent.notice",
    );
  });

  it("says the account is full when the server says so", async () => {
    addLearner.mockRejectedValueOnce(refused(409, "too_many_learners"));
    await named("Tolu");

    tap("consent.agree");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "learners.full",
    );
  });
});
