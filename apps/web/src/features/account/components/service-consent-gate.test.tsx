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
import { serviceConsentKept } from "@/lib/account/service-consent";
import { KeysApp } from "@/test/keys-app";
import {
  AGREED,
  listed,
  refused,
  signedInAs,
  UID,
} from "@/test/account-session";

const { listLearners, agreeToService, signInAgain } = vi.hoisted(() => ({
  listLearners: vi.fn(),
  agreeToService: vi.fn(),
  signInAgain: vi.fn(),
}));
vi.mock("@/lib/account/learners-api", () => ({ listLearners, agreeToService }));
vi.mock("@/lib/account/sign-in", async (original) => ({
  ...(await original<typeof import("@/lib/account/sign-in")>()),
  prepareSignIn: () => undefined,
  signInAgain,
}));

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

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  signInAgain.mockResolvedValue("fresh-token");
  agreeToService.mockResolvedValue(AGREED);
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

  it("open once a parent has signed in again and agreed, with the fresh sign-in", async () => {
    signedInAs(ADA);
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", null)]);
    gated();
    await screen.findByText(SERVICE_NOTICE);

    fireEvent.click(screen.getByRole("button", { name: "consent.agree" }));

    expect(await screen.findByText("the learner's pages")).toBeTruthy();
    expect(agreeToService).toHaveBeenCalledWith(ADA.id, {
      noticeVersion: 1,
      firebaseIdToken: "fresh-token",
    });
    expect(serviceConsentKept(UID, ADA.id)).toBe(true);
  });

  it("stay shut when the server refuses the agreement, and say to try again", async () => {
    signedInAs(ADA);
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", null)]);
    agreeToService.mockRejectedValueOnce(refused(401, "sign_in_stale"));
    gated();
    await screen.findByText(SERVICE_NOTICE);

    fireEvent.click(screen.getByRole("button", { name: "consent.agree" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "consent.signIn",
    );
    expect(pages()).toBeNull();
    expect(serviceConsentKept(UID, ADA.id)).toBe(false);
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

  it("are left to the session when the account no longer holds the learner", async () => {
    signedInAs(ADA);
    listLearners.mockResolvedValue([]);

    gated();

    expect(await screen.findByText("the learner's pages")).toBeTruthy();
  });
});
