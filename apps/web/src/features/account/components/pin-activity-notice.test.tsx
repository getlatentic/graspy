// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeysApp } from "@/test/keys-app";

const api = vi.hoisted(() => ({
  getPinActivity: vi.fn(),
  acknowledgePinActivity: vi.fn(),
  signInAgain: vi.fn(),
  startParentSession: vi.fn(),
}));
vi.mock("@/lib/account/parent-pin-api", async (original) => ({
  ...(await original<typeof import("@/lib/account/parent-pin-api")>()),
  getPinActivity: api.getPinActivity,
  acknowledgePinActivity: api.acknowledgePinActivity,
}));
vi.mock("@/lib/account/sign-in", async (original) => ({
  ...(await original<typeof import("@/lib/account/sign-in")>()),
  prepareSignIn: () => undefined,
  signInAgain: api.signInAgain,
}));
vi.mock("@/lib/api/session", async (original) => ({
  ...(await original<typeof import("@/lib/api/session")>()),
  startParentSession: api.startParentSession,
}));

const { PinActivityNotice } = await import("./pin-activity-notice");

const AT = Date.UTC(2026, 10, 20, 12);

function shown() {
  render(
    <KeysApp>
      <PinActivityNotice />
    </KeysApp>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.signInAgain.mockResolvedValue("fresh");
  api.startParentSession.mockResolvedValue(undefined);
  api.acknowledgePinActivity.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("what the parent is told of their PIN", () => {
  it("is nothing when nothing happened", async () => {
    api.getPinActivity.mockResolvedValue([]);
    shown();

    await waitFor(() => expect(api.getPinActivity).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says wrong PINs locked it, it turned off, and it was reset with its TVs", async () => {
    api.getPinActivity.mockResolvedValue([
      { id: 3, kind: "reset", at: AT, count: 2 },
      { id: 2, kind: "disabled", at: AT, count: 15 },
      { id: 1, kind: "locked", at: AT, count: 5 },
    ]);
    shown();

    const text = (await screen.findByRole("status")).textContent ?? "";
    expect(text).toContain("parentPin.noticeLocked 5");
    expect(text).toContain("parentPin.noticeDisabled 15");
    expect(text).toContain("parentPin.noticeReset");
    expect(text).toContain("parentPin.noticeResetTvs 2");
  });

  it("says the wrong PINs below a lock, and a TV or an agreement the PIN let through", async () => {
    api.getPinActivity.mockResolvedValue([
      { id: 6, kind: "consent", at: AT, count: null },
      { id: 5, kind: "tv_linked", at: AT, count: null },
      { id: 4, kind: "wrong", at: AT, count: 3 },
    ]);
    shown();

    const text = (await screen.findByRole("status")).textContent ?? "";
    expect(text).toContain("parentPin.noticeWrong 3");
    expect(text).toContain("parentPin.noticeTv");
    expect(text).toContain("parentPin.noticeConsent");
  });

  it("clears only up to the newest event the page showed", async () => {
    api.getPinActivity.mockResolvedValue([
      { id: 9, kind: "locked", at: AT, count: 5 },
      { id: 7, kind: "wrong", at: AT, count: 3 },
    ]);
    shown();
    await screen.findByRole("status");

    fireEvent.click(
      screen.getByRole("button", { name: "parentPin.noticeDismiss" }),
    );

    await waitFor(() =>
      expect(api.acknowledgePinActivity).toHaveBeenCalledWith(9),
    );
  });

  it("is cleared only by a Google sign-in made at the tap, then the parent's session, then the acknowledgement", async () => {
    api.getPinActivity.mockResolvedValue([
      { id: 1, kind: "locked", at: AT, count: 5 },
    ]);
    shown();
    await screen.findByRole("status");

    fireEvent.click(
      screen.getByRole("button", { name: "parentPin.noticeDismiss" }),
    );

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(api.startParentSession).toHaveBeenCalledWith("fresh");
    expect(api.acknowledgePinActivity).toHaveBeenCalledWith(1);
    expect(api.signInAgain.mock.invocationCallOrder[0]).toBeLessThan(
      api.acknowledgePinActivity.mock.invocationCallOrder[0],
    );
  });

  it("stays when Google's window is closed: a child cannot clear it", async () => {
    api.getPinActivity.mockResolvedValue([
      { id: 1, kind: "locked", at: AT, count: 5 },
    ]);
    api.signInAgain.mockRejectedValue({ code: "auth/popup-closed-by-user" });
    shown();
    await screen.findByRole("status");

    fireEvent.click(
      screen.getByRole("button", { name: "parentPin.noticeDismiss" }),
    );

    await waitFor(() => expect(api.signInAgain).toHaveBeenCalled());
    expect(api.acknowledgePinActivity).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
