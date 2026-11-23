// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";
import type { TvLinkRequest, TvPoll } from "@/lib/account/tv-link-api";
import { forgetInput, noteInput } from "@/lib/account/tv-presence";

const {
  startTvLink,
  pollTvLink,
  continueTvLink,
  cancelTvLink,
  startTvSession,
  account,
} = vi.hoisted(() => ({
  startTvLink: vi.fn<() => Promise<TvLinkRequest>>(),
  pollTvLink: vi.fn<(code: string) => Promise<TvPoll>>(),
  continueTvLink: vi.fn<(code: string) => Promise<TvPoll>>(),
  cancelTvLink: vi.fn<(code: string) => Promise<void>>(),
  startTvSession: vi.fn(),
  account: { current: null as object | null },
}));
vi.mock("@/lib/account/tv-link-api", () => ({
  startTvLink,
  pollTvLink,
  continueTvLink,
  cancelTvLink,
  signOutTv: vi.fn(async () => undefined),
}));
vi.mock("@/lib/api/session", () => ({ startTvSession }));
vi.mock("@/lib/qr-path", async (original) => {
  const actual = await original<typeof import("@/lib/qr-path")>();
  return { ...actual, qrPath: vi.fn(actual.qrPath) };
});
vi.mock("@/lib/account/use-account", () => ({
  useAccount: () => account.current,
}));

import { qrPath } from "@/lib/qr-path";
import TvSignInPage from "./tv-sign-in-page";

const REQUEST: TvLinkRequest = {
  deviceCode: "device-code",
  userCode: "ABCD2345",
  verificationUri: "https://graspy.example/link",
  verificationUriComplete: "https://graspy.example/link#code=ABCD2345",
  expiresIn: 600,
  interval: 5,
};

const lookup = (key: string, values?: Record<string, string | number>) => {
  const message = key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en) as string;
  return message.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name]));
};

function page() {
  return render(
    <MemoryRouter initialEntries={["/app/sign-in/phone"]}>
      <I18nContext.Provider
        value={{ t: lookup, locale: "en", setLocale: () => {} } as never}
      >
        <Routes>
          <Route path="/app/sign-in/phone" element={<TvSignInPage />} />
          <Route path="/app/sign-in" element={<p>the sign-in page</p>} />
          <Route path="/app" element={<p>the app</p>} />
        </Routes>
      </I18nContext.Provider>
    </MemoryRouter>,
  );
}

const secondsPass = (seconds: number) =>
  act(() => vi.advanceTimersByTimeAsync(seconds * 1000));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  // The press of the sign-in card's link that opened this screen: what gives it presence.
  forgetInput();
  noteInput();
  account.current = null;
  startTvLink.mockReset().mockResolvedValue(REQUEST);
  pollTvLink.mockReset().mockResolvedValue({ status: "pending" });
  startTvSession.mockReset();
  continueTvLink.mockReset();
  cancelTvLink.mockReset().mockResolvedValue(undefined);
  vi.mocked(qrPath).mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const LINKING_ADA = {
  status: "linking" as const,
  learner: { id: "a1b2c3d4e5f6", name: "Ada" },
  approver: { account: "t***@gmail.com", label: "iPhone", country: "NG" },
};
const APPROVED_ADA = {
  status: "approved" as const,
  token: "session",
  expiresIn: 3600,
  refreshToken: "refresh",
  account: "uid-1",
  learner: { id: "a1b2c3d4e5f6", name: "Ada" },
};

/** The phone approves only at `at` seconds after the screen opened. */
function approvedAfter(at: number) {
  const opened = Date.now();
  pollTvLink.mockImplementation(async () =>
    Date.now() - opened >= at * 1000
      ? LINKING_ADA
      : { status: "pending" as const },
  );
}

describe("the TV's sign-in with a phone", () => {
  it("shows the code, where to enter it, a QR code and the time left, with no field to fill", async () => {
    page();
    await secondsPass(1);

    expect(
      screen.getByRole("heading", { name: en.tvSignIn.title }),
    ).toBeTruthy();
    expect(screen.getByText("ABCD 2345")).toBeTruthy();
    expect(screen.getByText("graspy.example/link")).toBeTruthy();
    expect(screen.getByText("Expires in 9:59")).toBeTruthy();
    await act(() => vi.dynamicImportSettled());
    const qr = screen.getByRole("img", { name: en.tvSignIn.qr });
    expect(qr.querySelector("path")?.getAttribute("d")).toMatch(
      /^M\d+ \d+h1v1h-1z/,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("counts the time down as it passes", async () => {
    page();
    await secondsPass(1);

    await secondsPass(60);

    expect(screen.getByText("Expires in 8:59")).toBeTruthy();
  });

  it("draws the address and the code into the QR code, and no token", async () => {
    page();
    await secondsPass(1);
    await act(() => vi.dynamicImportSettled());

    expect(qrPath).toHaveBeenCalledTimes(1);
    expect(qrPath).toHaveBeenCalledWith(
      "https://graspy.example/link#code=ABCD2345",
    );
  });

  it("lays its controls out for a remote: real buttons and links, new code and cancel", async () => {
    page();
    await secondsPass(1);

    const fresh = screen.getByRole("button", { name: en.tvSignIn.newCode });
    const cancel = screen.getByRole("link", { name: en.tvSignIn.cancel });
    expect(fresh.tagName).toBe("BUTTON");
    expect(cancel.getAttribute("href")).toBe("/app/sign-in");
  });

  it("polls the code until the phone approves, then says whom it is linking to, with a countdown and Cancel focused, and signs in nothing yet", async () => {
    pollTvLink
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({
        status: "linking",
        learner: { id: "a1b2c3d4e5f6", name: "Ada" },
      });
    page();
    await secondsPass(10);

    expect(
      screen.getByRole("heading", { name: "Linking to Ada" }),
    ).toBeTruthy();
    expect(screen.getByText("Continuing in 5…")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: en.tvSignIn.continue }),
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: en.tvSignIn.cancel }),
    );
    expect(startTvSession).not.toHaveBeenCalled();
    expect(continueTvLink).not.toHaveBeenCalled();
  });

  it("counts the five seconds down on the screen", async () => {
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
      approver: { account: "t***@gmail.com", label: "iPhone", country: "NG" },
    });
    page();
    await secondsPass(5);
    expect(screen.getByText("Continuing in 5…")).toBeTruthy();

    await secondsPass(2);

    expect(screen.getByText("Continuing in 3…")).toBeTruthy();
  });

  it("goes on by itself when the countdown ends, and signs the device in", async () => {
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
      approver: { account: "t***@gmail.com", label: "iPhone", country: "NG" },
    });
    continueTvLink.mockResolvedValue({
      status: "approved",
      token: "session",
      expiresIn: 3600,
      refreshToken: "refresh",
      account: "uid-1",
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
    });
    page();
    await secondsPass(5);
    expect(startTvSession).not.toHaveBeenCalled();

    await secondsPass(5.1);

    expect(continueTvLink).toHaveBeenCalledWith("device-code");
    expect(startTvSession).toHaveBeenCalledWith({
      token: "session",
      expiresIn: 3600,
      refreshToken: "refresh",
      account: "uid-1",
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
    });
  });

  it("does not go on when Cancel is pressed inside the countdown: it cancels the request and returns to sign-in", async () => {
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
      approver: { account: "t***@gmail.com", label: "iPhone", country: "NG" },
    });
    continueTvLink.mockResolvedValue({
      status: "approved",
      token: "session",
      expiresIn: 3600,
      refreshToken: "refresh",
      account: "uid-1",
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
    });
    page();
    await secondsPass(7);

    await act(async () =>
      screen.getByRole("button", { name: en.tvSignIn.cancel }).click(),
    );
    await secondsPass(60);

    expect(cancelTvLink).toHaveBeenCalledWith("device-code");
    expect(continueTvLink).not.toHaveBeenCalled();
    expect(startTvSession).not.toHaveBeenCalled();
    expect(screen.getByText("the sign-in page")).toBeTruthy();
  });

  it("cancels the request when the person goes Back out of the screen inside the countdown", async () => {
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
      approver: { account: "t***@gmail.com", label: "iPhone", country: "NG" },
    });
    const view = page();
    await secondsPass(7);

    view.unmount();
    await secondsPass(60);

    expect(cancelTvLink).toHaveBeenCalledWith("device-code");
    expect(continueTvLink).not.toHaveBeenCalled();
  });

  it("says which account approved it, on what phone and where, so the person here can tell it is not theirs", async () => {
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
      approver: { account: "t***@gmail.com", label: "iPhone", country: "NG" },
    });
    page();
    await secondsPass(6);

    expect(
      screen.getByText("Approved by t***@gmail.com on iPhone (Nigeria)."),
    ).toBeTruthy();
  });

  it("says only the phone when no address was given", async () => {
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
      approver: { label: "iPhone" },
    });
    page();
    await secondsPass(6);

    expect(screen.getByText("Approved on iPhone.")).toBeTruthy();
  });

  it("always starts on Cancel, even for an account the TV has seen before, so Enter declines", async () => {
    localStorage.setItem(
      "graspy.tv-known-accounts",
      JSON.stringify(["t***@gmail.com"]),
    );
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
      approver: { account: "t***@gmail.com", label: "iPhone", country: "NG" },
    });
    page();
    await secondsPass(6);

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: en.tvSignIn.cancel }),
    );
  });

  it("says the account has ten TVs when the server keeps the request for that, with Continue to try again and Cancel first", async () => {
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
      approver: {},
    });
    continueTvLink.mockResolvedValue({ status: "full" });
    page();
    await secondsPass(11);

    expect(
      screen.getByRole("heading", { name: en.tvSignIn.full }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: en.tvSignIn.cancel }),
    );
    expect(startTvSession).not.toHaveBeenCalled();
    expect(cancelTvLink).not.toHaveBeenCalled();
  });

  it("declines on Cancel: the request is cancelled, nothing is signed in and the sign-in page returns", async () => {
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
    });
    page();
    await secondsPass(6);

    await act(async () =>
      screen.getByRole("button", { name: en.tvSignIn.cancel }).click(),
    );

    expect(cancelTvLink).toHaveBeenCalledWith("device-code");
    expect(continueTvLink).not.toHaveBeenCalled();
    expect(startTvSession).not.toHaveBeenCalled();
    expect(screen.getByText("the sign-in page")).toBeTruthy();
  });

  it("goes to the app once the device holds an account", () => {
    account.current = { uid: "uid-1" };
    page();

    expect(screen.getByText("the app")).toBeTruthy();
    expect(startTvLink).not.toHaveBeenCalled();
  });

  it("says when the code ran out and offers a new one, focused", async () => {
    page();
    await secondsPass(601);

    expect(screen.getByRole("alert").textContent).toBe(en.tvSignIn.expired);
    const fresh = screen.getByRole("button", { name: en.tvSignIn.newCode });
    expect(document.activeElement).toBe(fresh);
  });

  it("asks for a new code, which replaces the old one", async () => {
    startTvLink
      .mockResolvedValueOnce(REQUEST)
      .mockResolvedValueOnce({ ...REQUEST, userCode: "WXYZ6789" });
    page();
    await secondsPass(1);

    await act(async () => {
      screen.getByRole("button", { name: en.tvSignIn.newCode }).click();
    });
    await secondsPass(1);

    expect(screen.getByText("WXYZ 6789")).toBeTruthy();
    expect(screen.queryByText("ABCD 2345")).toBeNull();
  });

  it("stops polling the old code once a new one is asked for", async () => {
    page();
    await secondsPass(1);
    await act(async () => {
      screen.getByRole("button", { name: en.tvSignIn.newCode }).click();
    });
    pollTvLink.mockClear();

    await secondsPass(5);

    expect(pollTvLink).toHaveBeenCalledTimes(1);
  });

  it("says when the phone said no", async () => {
    pollTvLink.mockResolvedValue({ status: "denied" });
    page();
    await secondsPass(6);

    expect(screen.getByRole("alert").textContent).toBe(en.tvSignIn.denied);
  });

  it("says when no code could be had", async () => {
    startTvLink.mockRejectedValue(new Error("offline"));
    page();
    await secondsPass(1);

    expect(screen.getByRole("alert").textContent).toBe(en.tvSignIn.failed);
  });

  it("cancels back to the sign-in page and stops polling", async () => {
    page();
    await secondsPass(1);

    await act(async () => {
      screen.getByRole("link", { name: en.tvSignIn.cancel }).click();
    });
    await secondsPass(30);

    expect(screen.getByText("the sign-in page")).toBeTruthy();
    expect(pollTvLink).not.toHaveBeenCalled();
    expect(cancelTvLink).toHaveBeenCalledWith("device-code");
  });

  it("reads the code out letter by letter for a screen reader", async () => {
    page();
    await secondsPass(1);

    expect(screen.getByText("A B C D 2 3 4 5")).toBeTruthy();
  });

  describe("whether anyone is at the TV", () => {
    it("shows Continue, and no countdown, and calls nothing, when the TV saw no input for three minutes", async () => {
      approvedAfter(190);
      continueTvLink.mockResolvedValue(APPROVED_ADA);
      page();

      await secondsPass(200);

      expect(
        screen.getByRole("heading", { name: "Linking to Ada" }),
      ).toBeTruthy();
      expect(screen.queryByText(/^Continuing in \d+…$/)).toBeNull();
      expect(
        screen.getByRole("button", { name: en.tvSignIn.continue }),
      ).toBeTruthy();
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: en.tvSignIn.cancel }),
      );
      await secondsPass(120);
      expect(continueTvLink).not.toHaveBeenCalled();
      expect(startTvSession).not.toHaveBeenCalled();
    });

    it("goes on, from Continue, only when the person presses it", async () => {
      approvedAfter(190);
      continueTvLink.mockResolvedValue(APPROVED_ADA);
      page();
      await secondsPass(200);

      await act(async () =>
        screen.getByRole("button", { name: en.tvSignIn.continue }).click(),
      );

      expect(continueTvLink).toHaveBeenCalledTimes(1);
      expect(startTvSession).toHaveBeenCalledTimes(1);
    });

    it("goes on by itself when a person pressed a key on the TV within two minutes of the approval, even long after the code was shown", async () => {
      approvedAfter(190);
      continueTvLink.mockResolvedValue(APPROVED_ADA);
      page();
      await secondsPass(150);
      // A trusted key press is what the screen's tracker notes; a test cannot make one, so the
      // note is made as the tracker makes it.
      noteInput();

      await secondsPass(41);
      expect(screen.getByText(/^Continuing in \d+…$/)).toBeTruthy();
      await secondsPass(5.2);

      expect(continueTvLink).toHaveBeenCalledTimes(1);
      expect(startTvSession).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["a key", () => fireEvent.keyDown(document.body, { key: "ArrowDown" })],
      ["a pointer", () => fireEvent.pointerDown(document.body)],
      ["a touch", () => fireEvent.touchStart(document.body)],
      ["a wheel", () => fireEvent.wheel(document.body)],
    ])(
      "does not count %s that a script made, so nothing keeps an idle TV present",
      async (_, press) => {
        approvedAfter(190);
        continueTvLink.mockResolvedValue(APPROVED_ADA);
        page();
        await secondsPass(150);
        press();

        await secondsPass(40 + 5 + 5.2);

        expect(continueTvLink).not.toHaveBeenCalled();
        expect(
          screen.getByRole("button", { name: en.tvSignIn.continue }),
        ).toBeTruthy();
      },
    );

    it("does not count the screen merely opening: with no press of a person before it, it waits for Continue", async () => {
      forgetInput();
      approvedAfter(4);
      continueTvLink.mockResolvedValue(APPROVED_ADA);
      page();

      await secondsPass(30);

      expect(continueTvLink).not.toHaveBeenCalled();
      expect(screen.queryByText(/^Continuing in \d+…$/)).toBeNull();
      expect(
        screen.getByRole("button", { name: en.tvSignIn.continue }),
      ).toBeTruthy();
    });

    it("does not go on when the page is hidden as the countdown ends", async () => {
      approvedAfter(4);
      continueTvLink.mockResolvedValue(APPROVED_ADA);
      page();
      await secondsPass(6);
      expect(screen.getByText(/^Continuing in \d+…$/)).toBeTruthy();

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      await secondsPass(5.2);
      Reflect.deleteProperty(document, "visibilityState");

      expect(continueTvLink).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: en.tvSignIn.continue }),
      ).toBeTruthy();
    });

    it("announces the countdown once, to a screen reader, and not every second", async () => {
      approvedAfter(4);
      page();
      await secondsPass(6);

      const announced = screen.getByRole("status");
      expect(announced.textContent).toBe(en.tvSignIn.goesOnAnnounce);
      await secondsPass(2);
      expect(screen.getByRole("status").textContent).toBe(
        en.tvSignIn.goesOnAnnounce,
      );
      expect(
        screen.getByText(/^Continuing in \d+…$/).getAttribute("aria-hidden"),
      ).toBe("true");
    });

    it("shows the countdown from the same deadline the timer runs on", async () => {
      approvedAfter(4);
      page();
      await secondsPass(5);
      expect(screen.getByText("Continuing in 5…")).toBeTruthy();

      await secondsPass(3);

      expect(screen.getByText("Continuing in 2…")).toBeTruthy();
    });
  });

  it("puts the code in the QR code in the address's fragment, never in a query string", async () => {
    page();
    await secondsPass(1);
    await act(() => vi.dynamicImportSettled());

    const drawn = vi.mocked(qrPath).mock.calls.at(-1)?.[0] ?? "";
    expect(drawn).toContain("#code=");
    expect(drawn).not.toContain("?");
  });
});
