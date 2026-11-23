// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SLOW_MS } from "@/hooks/use-slow";
import { setAccount } from "@/lib/account/account-store";
import { SERVICE_NOTICE } from "@/lib/account/consent-notices";
import { toApiError } from "@/lib/api/errors";
import { serviceConsentKept } from "@/lib/account/service-consent";
import { KeysApp } from "@/test/keys-app";
import { parentSession } from "@/test/parent-session";
import {
  AGREED,
  listed,
  refused,
  signedInAs,
  UID,
} from "@/test/account-session";

const {
  listLearners,
  agreeToService,
  signInAgain,
  signOut,
  flushUnsent,
  getPinStatus,
  verifyPin,
} = vi.hoisted(() => ({
  listLearners: vi.fn(),
  agreeToService: vi.fn(),
  signInAgain: vi.fn(),
  signOut: vi.fn(),
  flushUnsent: vi.fn(),
  getPinStatus: vi.fn(),
  verifyPin: vi.fn(),
}));
vi.mock("@/lib/account/parent-pin-api", async (original) => ({
  ...(await original<typeof import("@/lib/account/parent-pin-api")>()),
  getPinStatus,
  verifyPin,
}));
vi.mock("@/lib/account/learner-choice", () => ({ flushUnsent }));
vi.mock("@/lib/account/learners-api", () => ({ listLearners, agreeToService }));
vi.mock("@/lib/api/session", async (original) =>
  (await import("@/test/parent-session")).withParentSession(await original()),
);
vi.mock("@/lib/account/sign-in", async (original) => ({
  ...(await original<typeof import("@/lib/account/sign-in")>()),
  prepareSignIn: () => undefined,
  signInAgain,
  signOut,
}));

const { ParentSignInNeeded } = await import("@/lib/api/session");
const { ServiceConsentGate } = await import("./service-consent-gate");

const ADA = { id: "a00000000001", name: "Ada" };

function gated() {
  render(
    <KeysApp>
      <ServiceConsentGate>
        <p>the learner's pages</p>
      </ServiceConsentGate>
    </KeysApp>,
  );
}

const pages = () => screen.queryByText("the learner's pages");

const refusedForConsent = () =>
  toApiError(
    new Response(
      JSON.stringify({ detail: { error: "no", code: "consent_required" } }),
      { status: 403 },
    ),
  );

beforeEach(() => {
  vi.resetAllMocks();
  parentSession.reset();
  window.localStorage.clear();
  signInAgain.mockResolvedValue("fresh-token");
  agreeToService.mockResolvedValue(AGREED);
  signOut.mockResolvedValue(undefined);
  flushUnsent.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  setAccount(null);
});

describe("the pages of a learner in use", () => {
  it("open at once on a device that is not signed in, which has no parent to ask", () => {
    setAccount(null);

    gated();

    expect(pages()).toBeTruthy();
    expect(listLearners).not.toHaveBeenCalled();
  });

  it("open at once when no learner is chosen yet", () => {
    signedInAs(null);

    gated();

    expect(pages()).toBeTruthy();
    expect(listLearners).not.toHaveBeenCalled();
  });

  it("open when the server holds a parent's agreement, which the device then remembers", async () => {
    signedInAs(ADA);
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", AGREED)]);

    gated();

    expect(await screen.findByText("the learner's pages")).toBeTruthy();
    expect(serviceConsentKept(UID, ADA.id)).toBe(true);
  });

  it("open offline once the device remembers the agreement, without asking", () => {
    signedInAs(ADA);
    window.localStorage.setItem(`graspy.service-consent.${UID}/${ADA.id}`, "1");

    gated();

    expect(pages()).toBeTruthy();
    expect(listLearners).not.toHaveBeenCalled();
  });

  it("stay shut, showing only the notice, while no parent has agreed", async () => {
    signedInAs(ADA);
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", null)]);

    gated();

    expect(await screen.findByText(SERVICE_NOTICE)).toBeTruthy();
    expect(pages()).toBeNull();
    expect(signInAgain).not.toHaveBeenCalled();
    expect(serviceConsentKept(UID, ADA.id)).toBe(false);
  });

  it("open once the parent has agreed under the parent's session in force", async () => {
    signedInAs(ADA);
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", null)]);
    parentSession.grant();
    gated();
    await screen.findByText(SERVICE_NOTICE);

    fireEvent.click(screen.getByRole("button", { name: "consent.agree" }));

    expect(await screen.findByText("the learner's pages")).toBeTruthy();
    expect(agreeToService).toHaveBeenCalledWith(ADA.id, { noticeVersion: 1 });
    expect(serviceConsentKept(UID, ADA.id)).toBe(true);
  });

  it("ask for the parent PIN first when the parent's session is not in force, and send nothing before it", async () => {
    signedInAs(ADA);
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", null)]);
    getPinStatus.mockResolvedValue({
      hasPin: true,
      length: 6,
      lockedUntil: null,
      disabled: false,
    });
    verifyPin.mockImplementation(async () => parentSession.grant());
    gated();
    await screen.findByText(SERVICE_NOTICE);

    fireEvent.click(screen.getByRole("button", { name: "consent.agree" }));
    await screen.findByRole("group", { name: "parentPin.title" });
    expect(agreeToService).not.toHaveBeenCalled();
    for (const digit of "482915") {
      fireEvent.click(screen.getByRole("button", { name: digit }));
    }

    expect(await screen.findByText("the learner's pages")).toBeTruthy();
    expect(verifyPin).toHaveBeenCalledWith("482915");
    expect(agreeToService).toHaveBeenCalledTimes(1);
  });

  it("come back to the notice, shut, when the parent cancels the PIN", async () => {
    signedInAs(ADA);
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", null)]);
    getPinStatus.mockResolvedValue({
      hasPin: true,
      length: 6,
      lockedUntil: null,
      disabled: false,
    });
    gated();
    await screen.findByText(SERVICE_NOTICE);
    fireEvent.click(screen.getByRole("button", { name: "consent.agree" }));

    fireEvent.click(
      await screen.findByRole("button", { name: "parentPin.cancel" }),
    );

    expect(await screen.findByText(SERVICE_NOTICE)).toBeTruthy();
    expect(agreeToService).not.toHaveBeenCalled();
    expect(pages()).toBeNull();
  });

  it("stay shut when the server refuses the agreement, and say to try again", async () => {
    signedInAs(ADA);
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", null)]);
    agreeToService.mockRejectedValueOnce(refused(503, "consent_not_kept"));
    parentSession.grant();
    gated();
    await screen.findByText(SERVICE_NOTICE);

    fireEvent.click(screen.getByRole("button", { name: "consent.agree" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "consent.notKept",
    );
    expect(pages()).toBeNull();
    expect(serviceConsentKept(UID, ADA.id)).toBe(false);
  });

  it("ask for the PIN again when the parent's session ended before the agreement was sent", async () => {
    signedInAs(ADA);
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", null)]);
    agreeToService.mockImplementationOnce(async () => {
      parentSession.end();
      throw new ParentSignInNeeded();
    });
    getPinStatus.mockResolvedValue({
      hasPin: true,
      length: 6,
      lockedUntil: null,
      disabled: false,
    });
    parentSession.grant();
    gated();
    await screen.findByText(SERVICE_NOTICE);

    fireEvent.click(screen.getByRole("button", { name: "consent.agree" }));

    expect(
      await screen.findByRole("group", { name: "parentPin.title" }),
    ).toBeTruthy();
    expect(pages()).toBeNull();
  });

  it("lead a parent who declines to choose someone else, and stay shut", async () => {
    signedInAs(ADA);
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", null)]);
    gated();
    await screen.findByText(SERVICE_NOTICE);

    fireEvent.click(screen.getByRole("button", { name: "consent.decline" }));

    expect((await screen.findByTestId("elsewhere")).textContent).toBe(
      "/app/learners",
    );
    expect(pages()).toBeNull();
    expect(agreeToService).not.toHaveBeenCalled();
  });

  it("stay shut when the server cannot be asked, and open on a later try that finds the agreement", async () => {
    signedInAs(ADA);
    listLearners
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([listed(ADA.id, "Ada", AGREED)]);

    gated();

    fireEvent.click(
      await screen.findByRole("button", { name: "learners.tryAgain" }),
    );
    await waitFor(() => expect(pages()).toBeTruthy());
    expect(listLearners).toHaveBeenCalledTimes(2);
  });

  it("shut again, and ask for the agreement, when the server refuses the learner for want of one", async () => {
    signedInAs(ADA);
    window.localStorage.setItem(`graspy.service-consent.${UID}/${ADA.id}`, "1");
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", null)]);
    gated();
    expect(pages()).toBeTruthy();

    await refusedForConsent();

    expect(await screen.findByText(SERVICE_NOTICE)).toBeTruthy();
    expect(pages()).toBeNull();
    expect(serviceConsentKept(UID, ADA.id)).toBe(false);
  });

  it("stay open when the refusal was for another learner, which the server says has agreed", async () => {
    signedInAs(ADA);
    window.localStorage.setItem(`graspy.service-consent.${UID}/${ADA.id}`, "1");
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", AGREED)]);
    gated();

    await refusedForConsent();
    await waitFor(() => expect(listLearners).toHaveBeenCalled());

    expect(pages()).toBeTruthy();
    expect(serviceConsentKept(UID, ADA.id)).toBe(true);
  });

  it("shut, offering another try, when a refusal comes and the server cannot be asked who lacks the agreement", async () => {
    signedInAs(ADA);
    window.localStorage.setItem(`graspy.service-consent.${UID}/${ADA.id}`, "1");
    listLearners.mockRejectedValue(new Error("offline"));
    gated();

    await refusedForConsent();

    expect(
      await screen.findByRole("button", { name: "learners.tryAgain" }),
    ).toBeTruthy();
    expect(pages()).toBeNull();
  });

  it("stay open when the server refuses a call for another reason", async () => {
    signedInAs(ADA);
    window.localStorage.setItem(`graspy.service-consent.${UID}/${ADA.id}`, "1");
    gated();

    await toApiError(
      new Response(
        JSON.stringify({ detail: { error: "no", code: "account_required" } }),
        { status: 403 },
      ),
    );

    expect(pages()).toBeTruthy();
    expect(serviceConsentKept(UID, ADA.id)).toBe(true);
  });

  it("are left to the session when the account no longer holds the learner", async () => {
    signedInAs(ADA);
    listLearners.mockResolvedValue([]);

    gated();

    expect(await screen.findByText("the learner's pages")).toBeTruthy();
  });
});

describe("a parent who cannot agree, in front of the gate", () => {
  it("can sign out from the agree step, and is led to sign in", async () => {
    signedInAs(ADA);
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", null)]);
    gated();
    await screen.findByText(SERVICE_NOTICE);

    fireEvent.click(screen.getByRole("button", { name: "you.signOut" }));

    expect((await screen.findByTestId("elsewhere")).textContent).toBe(
      "/app/sign-in",
    );
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(pages()).toBeNull();
  });

  it("can sign out when the server cannot be asked", async () => {
    signedInAs(ADA);
    listLearners.mockRejectedValue(new Error("offline"));
    gated();

    fireEvent.click(await screen.findByRole("button", { name: "you.signOut" }));

    expect((await screen.findByTestId("elsewhere")).textContent).toBe(
      "/app/sign-in",
    );
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("names what it waits for while the server is asked", () => {
    signedInAs(ADA);
    listLearners.mockReturnValue(new Promise(() => undefined));

    gated();

    expect(screen.getByRole("status").textContent).toBe("loading.opening");
  });

  it("offers another try once the server has been silent for a while", () => {
    vi.useFakeTimers();
    signedInAs(ADA);
    listLearners.mockReturnValue(new Promise(() => undefined));

    gated();
    expect(
      screen.queryByRole("button", { name: "loading.tryAgain" }),
    ).toBeNull();
    act(() => vi.advanceTimersByTime(SLOW_MS));
    fireEvent.click(screen.getByRole("button", { name: "loading.tryAgain" }));

    expect(listLearners).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe("signing out from in front of the gate, with answers still to be sent", () => {
  async function agreeStep() {
    signedInAs(ADA);
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", null)]);
    gated();
    await screen.findByText(SERVICE_NOTICE);
  }

  it("sends what is unsent first, and signs out only once it has been", async () => {
    await agreeStep();

    fireEvent.click(screen.getByRole("button", { name: "you.signOut" }));

    expect((await screen.findByTestId("elsewhere")).textContent).toBe(
      "/app/sign-in",
    );
    expect(flushUnsent).toHaveBeenCalledTimes(1);
    expect(flushUnsent.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
  });

  it("asks, and wipes nothing, when what is unsent could not be sent", async () => {
    flushUnsent.mockResolvedValue(false);
    await agreeStep();

    fireEvent.click(screen.getByRole("button", { name: "you.signOut" }));

    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("you.signOutUnsent")).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.queryByTestId("elsewhere")).toBeNull();
  });

  it("stays signed in, nothing wiped, when the parent cancels", async () => {
    flushUnsent.mockResolvedValue(false);
    await agreeStep();
    fireEvent.click(screen.getByRole("button", { name: "you.signOut" }));
    await screen.findByRole("alertdialog");

    fireEvent.click(screen.getByRole("button", { name: "you.cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText(SERVICE_NOTICE)).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out when the parent says to, having been told what is lost", async () => {
    flushUnsent.mockResolvedValue(false);
    await agreeStep();
    fireEvent.click(screen.getByRole("button", { name: "you.signOut" }));
    await screen.findByRole("alertdialog");

    fireEvent.click(screen.getByRole("button", { name: "you.signOutAnyway" }));

    expect((await screen.findByTestId("elsewhere")).textContent).toBe(
      "/app/sign-in",
    );
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("asks the same when the server cannot be asked and the parent signs out", async () => {
    flushUnsent.mockResolvedValue(false);
    signedInAs(ADA);
    listLearners.mockRejectedValue(new Error("offline"));
    gated();

    fireEvent.click(await screen.findByRole("button", { name: "you.signOut" }));

    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
  });
});
