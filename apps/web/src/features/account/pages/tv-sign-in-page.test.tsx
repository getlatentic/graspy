// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";
import type { TvLinkRequest, TvPoll } from "@/lib/account/tv-link-api";

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
  vi.useFakeTimers();
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

  it("polls the code until the phone approves, then asks whom to link to and signs in nothing yet", async () => {
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
    expect(
      screen.getByRole("button", { name: en.tvSignIn.continue }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: en.tvSignIn.cancel }),
    ).toBeTruthy();
    expect(startTvSession).not.toHaveBeenCalled();
    expect(continueTvLink).not.toHaveBeenCalled();
  });

  it("focuses Continue, a real button the remote can press, and signs in only when it is pressed", async () => {
    pollTvLink.mockResolvedValue({
      status: "linking",
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
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
    await secondsPass(6);
    const go = screen.getByRole("button", { name: en.tvSignIn.continue });
    expect(go.tagName).toBe("BUTTON");
    expect(document.activeElement).toBe(go);
    await secondsPass(60);
    expect(startTvSession).not.toHaveBeenCalled();

    await act(async () => go.click());

    expect(continueTvLink).toHaveBeenCalledWith(
      "device-code",
      expect.anything(),
    );
    expect(startTvSession).toHaveBeenCalledWith({
      token: "session",
      expiresIn: 3600,
      refreshToken: "refresh",
      account: "uid-1",
      learner: { id: "a1b2c3d4e5f6", name: "Ada" },
    });
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
});
