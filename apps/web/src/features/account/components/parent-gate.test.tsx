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
import { signedInAs, refused, WINDOW_CLOSED } from "@/test/account-session";
import { KeysApp } from "@/test/keys-app";
import { parentSession } from "@/test/parent-session";

const api = vi.hoisted(() => ({
  getPinStatus: vi.fn(),
  verifyPin: vi.fn(),
  savePin: vi.fn(),
  signInAgain: vi.fn(),
}));
vi.mock("@/lib/api/session", async (original) =>
  (await import("@/test/parent-session")).withParentSession(await original()),
);
vi.mock("@/lib/account/parent-pin-api", async (original) => ({
  ...(await original<typeof import("@/lib/account/parent-pin-api")>()),
  getPinStatus: api.getPinStatus,
  verifyPin: api.verifyPin,
  savePin: api.savePin,
}));
vi.mock("@/lib/account/sign-in", async (original) => ({
  ...(await original<typeof import("@/lib/account/sign-in")>()),
  prepareSignIn: () => undefined,
  signInAgain: api.signInAgain,
}));

const { ParentGate } = await import("./parent-gate");

const HAS_PIN = { hasPin: true, length: 4, lockedUntil: null };
const NO_PIN = { hasPin: false, length: null, lockedUntil: null };

function gate(props: Parameters<typeof ParentGate>[0] = {}) {
  return render(
    <KeysApp>
      <ParentGate {...props}>
        <p>what only the parent may do</p>
      </ParentGate>
    </KeysApp>,
  );
}

const behind = () => screen.queryByText("what only the parent may do");
const pad = (name = "parentPin.title") => screen.findByRole("group", { name });
const tap = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const type = (digits: string) => [...digits].forEach(tap);
const dots = () => document.querySelectorAll('[aria-hidden="true"] > span');

beforeEach(() => {
  vi.resetAllMocks();
  parentSession.reset();
  signedInAs(null);
  api.getPinStatus.mockResolvedValue(HAS_PIN);
  api.verifyPin.mockImplementation(async () => parentSession.grant());
  api.savePin.mockImplementation(async () => parentSession.grant());
  api.signInAgain.mockResolvedValue("fresh-token");
});

afterEach(cleanup);

describe("what is behind the parent gate", () => {
  it("shows at once, asking nothing, while the parent's session is in force", () => {
    parentSession.grant();

    gate();

    expect(behind()).toBeTruthy();
    expect(api.getPinStatus).not.toHaveBeenCalled();
  });

  it("stays out of sight until the PIN is typed, then shows", async () => {
    gate();

    await pad();
    expect(behind()).toBeNull();
    type("4827");

    expect(await screen.findByText("what only the parent may do")).toBeTruthy();
    expect(api.verifyPin).toHaveBeenCalledWith("4827");
  });

  it("goes out of sight again, asking for the PIN, when the parent's session ends", async () => {
    parentSession.grant();
    gate();
    expect(behind()).toBeTruthy();

    act(() => parentSession.end());

    await pad();
    expect(behind()).toBeNull();
  });

  it("tells a gate with nothing behind it that the session is in force, once, and shows a spinner", async () => {
    const unlocked = vi.fn();
    render(
      <KeysApp>
        <ParentGate onUnlocked={unlocked} />
      </KeysApp>,
    );
    await pad();

    type("4827");

    await waitFor(() => expect(unlocked).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("tells it at once when the session is in force already", () => {
    parentSession.grant();
    const unlocked = vi.fn();

    render(
      <KeysApp>
        <ParentGate onUnlocked={unlocked} />
      </KeysApp>,
    );

    expect(unlocked).toHaveBeenCalledTimes(1);
  });
});

describe("a parent who has a PIN", () => {
  it("types it on a pad as long as it is, and it is sent when the last digit is typed", async () => {
    api.getPinStatus.mockResolvedValue({ ...HAS_PIN, length: 6 });
    gate();
    await pad();
    expect(dots()).toHaveLength(6);

    type("48271");
    expect(api.verifyPin).not.toHaveBeenCalled();
    type("9");

    expect(api.verifyPin).toHaveBeenCalledWith("482719");
  });

  it("is told it was wrong, can type again, and is let in by the right one", async () => {
    api.verifyPin
      .mockRejectedValueOnce(refused(403, "pin_wrong"))
      .mockImplementationOnce(async () => parentSession.grant());
    gate();
    await pad();

    type("1357");

    expect(await screen.findByText("parentPin.wrong")).toBeTruthy();
    expect(document.querySelectorAll("[data-filled]")).toHaveLength(0);
    type("4827");
    expect(await screen.findByText("what only the parent may do")).toBeTruthy();
    expect(api.verifyPin).toHaveBeenCalledTimes(2);
  });

  it("is told to wait when too many tries are made", async () => {
    api.verifyPin.mockRejectedValueOnce(refused(429, "rate_limited"));
    gate();
    await pad();

    type("1357");

    expect(await screen.findByText("parentPin.busy")).toBeTruthy();
  });

  it("is told it did not work when the server cannot be reached, and may try again", async () => {
    api.verifyPin.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    gate();
    await pad();

    type("1357");

    expect(await screen.findByText("parentPin.failed")).toBeTruthy();
  });

  it("is shown how long the account is locked, and is not offered the pad", async () => {
    api.getPinStatus.mockResolvedValue({
      ...HAS_PIN,
      lockedUntil: Date.now() + 14 * 60_000 + 20_000,
    });
    gate();

    expect(await screen.findByText("parentPin.lockedMinutes 15")).toBeTruthy();
    expect(screen.queryByRole("group")).toBeNull();
    expect(behind()).toBeNull();
  });

  it("is told hours when the lock is a day", async () => {
    api.getPinStatus.mockResolvedValue({
      ...HAS_PIN,
      lockedUntil: Date.now() + 23 * 3_600_000 + 60_000,
    });
    gate();

    expect(await screen.findByText("parentPin.lockedHours 24")).toBeTruthy();
  });

  it("is locked out by the fifth wrong PIN, as the server says, and the pad goes", async () => {
    api.verifyPin.mockRejectedValueOnce(
      new (await import("@/lib/api/errors")).ApiError("locked", 429, {
        detail: { code: "pin_locked", lockedUntil: Date.now() + 15 * 60_000 },
      }),
    );
    gate();
    await pad();

    type("1357");

    expect(await screen.findByText(/parentPin.lockedMinutes/)).toBeTruthy();
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("asks the server again when the lock has ended", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.getPinStatus
      .mockResolvedValueOnce({ ...HAS_PIN, lockedUntil: Date.now() + 2_000 })
      .mockResolvedValueOnce(HAS_PIN);
    gate();
    await screen.findByText(/parentPin.lockedMinutes/);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    await pad();
    expect(api.getPinStatus).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("is asked for the PIN set again, when the server says it is not set", async () => {
    api.verifyPin.mockRejectedValueOnce(refused(409, "pin_not_set"));
    api.getPinStatus
      .mockResolvedValueOnce(HAS_PIN)
      .mockResolvedValueOnce(NO_PIN);
    gate();
    await pad();

    type("1357");

    await pad("parentPin.set");
  });

  it("is offered another try when it cannot be asked whether there is a PIN", async () => {
    api.getPinStatus
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(HAS_PIN);
    gate();

    fireEvent.click(
      await screen.findByRole("button", { name: "learners.tryAgain" }),
    );

    await pad();
  });

  it("can leave when the gate was opened by a choice", async () => {
    const cancelled = vi.fn();
    gate({ onCancel: cancelled });
    await pad();

    tap("parentPin.cancel");

    expect(cancelled).toHaveBeenCalled();
  });

  it("is offered no way out where there is no choice to leave", async () => {
    gate();
    await pad();

    expect(
      screen.queryByRole("button", { name: "parentPin.cancel" }),
    ).toBeNull();
  });
});

describe("a parent with no PIN yet", () => {
  async function chosen(pin: string) {
    gate();
    await pad("parentPin.set");
    type(pin);
    // The longest PIN is sent by itself.
    if (pin.length < 8) tap("parentPin.next");
    await pad("parentPin.again");
    type(pin);
  }

  it("chooses one, types it again, then signs in with Google to save it", async () => {
    api.getPinStatus.mockResolvedValue(NO_PIN);
    await chosen("48271");
    expect(api.savePin).not.toHaveBeenCalled();
    expect(api.signInAgain).not.toHaveBeenCalled();
    expect(await screen.findByText("parentPin.save")).toBeTruthy();

    tap("you.signIn");

    expect(await screen.findByText("what only the parent may do")).toBeTruthy();
    expect(api.savePin).toHaveBeenCalledWith("48271", {
      firebaseIdToken: "fresh-token",
    });
    expect(api.verifyPin).not.toHaveBeenCalled();
  });

  it("is told when the two do not match, and starts over", async () => {
    api.getPinStatus.mockResolvedValue(NO_PIN);
    gate();
    await pad("parentPin.set");
    type("4827");
    tap("parentPin.next");
    await pad("parentPin.again");

    type("4828");

    expect(await screen.findByText("parentPin.mismatch")).toBeTruthy();
    await pad("parentPin.set");
    expect(api.savePin).not.toHaveBeenCalled();
  });

  it.each(["0000", "1234", "9876", "55555"])(
    "is told %s is too easy, and is not asked to type it again",
    async (easy) => {
      api.getPinStatus.mockResolvedValue(NO_PIN);
      gate();
      await pad("parentPin.set");

      type(easy);
      tap("parentPin.next");

      expect(await screen.findByText("parentPin.easy")).toBeTruthy();
      expect(
        screen.queryByRole("group", { name: "parentPin.again" }),
      ).toBeNull();
    },
  );

  it("is not given a PIN the server refuses as too easy, and chooses again", async () => {
    api.getPinStatus.mockResolvedValue(NO_PIN);
    api.savePin.mockRejectedValueOnce(refused(422, "pin_too_easy"));
    await chosen("4827");
    await screen.findByText("parentPin.save");

    tap("you.signIn");

    expect(await screen.findByText("parentPin.easy")).toBeTruthy();
    await pad("parentPin.set");
  });

  it("is led to sign in when Firebase holds nobody, and saves nothing", async () => {
    api.getPinStatus.mockResolvedValue(NO_PIN);
    api.signInAgain.mockRejectedValueOnce({ code: "graspy/not-signed-in" });
    await chosen("4827");
    await screen.findByText("parentPin.save");

    tap("you.signIn");

    expect((await screen.findAllByRole("alert"))[0].textContent).toContain(
      "consent.signedOut",
    );
    expect(api.savePin).not.toHaveBeenCalled();
  });

  it("is told nothing, and may press again, when Google's window is closed", async () => {
    api.getPinStatus.mockResolvedValue(NO_PIN);
    api.signInAgain.mockRejectedValueOnce(WINDOW_CLOSED);
    await chosen("4827");
    await screen.findByText("parentPin.save");

    tap("you.signIn");

    await waitFor(() => expect(api.signInAgain).toHaveBeenCalled());
    expect(
      (screen.getByRole("button", { name: "you.signIn" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(document.querySelector("[role=alert]:not(:empty)")).toBeNull();
    expect(api.savePin).not.toHaveBeenCalled();
  });

  it("uses a PIN of up to eight digits", async () => {
    api.getPinStatus.mockResolvedValue(NO_PIN);
    await chosen("48271935");
    await screen.findByText("parentPin.save");

    tap("you.signIn");

    await waitFor(() =>
      expect(api.savePin).toHaveBeenCalledWith("48271935", {
        firebaseIdToken: "fresh-token",
      }),
    );
  });
});

describe("a parent who forgot the PIN", () => {
  it("chooses a new one, and saves it with a Google sign-in, which is what makes them the parent", async () => {
    gate();
    await pad();

    tap("parentPin.forgot");
    await pad("parentPin.set");
    type("7391");
    tap("parentPin.next");
    await pad("parentPin.again");
    type("7391");
    tap("you.signIn");

    expect(await screen.findByText("what only the parent may do")).toBeTruthy();
    expect(api.savePin).toHaveBeenCalledWith("7391", {
      firebaseIdToken: "fresh-token",
    });
    expect(api.verifyPin).not.toHaveBeenCalled();
  });

  it("can do so from the lock, which the new PIN ends", async () => {
    api.getPinStatus.mockResolvedValue({
      ...HAS_PIN,
      lockedUntil: Date.now() + 600_000,
    });
    gate();
    await screen.findByText(/parentPin.lockedMinutes/);

    tap("parentPin.forgot");

    await pad("parentPin.set");
  });
});

describe("the PIN, on the page and off it", () => {
  it("is nowhere in the page, the address or storage, however it was typed", async () => {
    const stored = vi.spyOn(Storage.prototype, "setItem");
    const logged = vi.spyOn(console, "warn");
    api.verifyPin.mockRejectedValueOnce(refused(403, "pin_wrong"));
    const { container } = gate();
    await pad();

    type("4827");
    await screen.findByText("parentPin.wrong");

    expect(container.innerHTML.replace(/>[0-9]</g, "><")).not.toContain("4827");
    expect(window.location.href).not.toContain("4827");
    expect(stored).not.toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain("4827");
    stored.mockRestore();
  });
});
