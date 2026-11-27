// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { ApiError } from "@/lib/api/errors";
import type { WidgetOptions } from "@/lib/challenge/turnstile-script";
import { I18nContext } from "@/lib/i18n-context";
import { signedInAs } from "@/test/account-session";
import en from "@/locales/en.json";

vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  TURNSTILE_SITE_KEY: "site-key",
}));

// A session that needs the check, as a visitor's first does, or one that does not (a renewal).
let needsCheck = true;
let sessionFailure: Error | null = null;
const mint = async () => {
  if (sessionFailure) throw sessionFailure;
  if (needsCheck) {
    const { solveChallenge } = await import("@/lib/challenge/challenge");
    await solveChallenge();
  }
  return "session";
};
vi.mock("@/lib/api/chat-session", () => ({
  chatTokens: { get: vi.fn(() => mint()), refresh: () => mint() },
}));

// The widget is injected: what the page renders into, and the callbacks it gave.
const rendered: WidgetOptions[] = [];
const removed: string[] = [];
const loadTurnstile = vi.fn(async () => ({
  render: (_container: HTMLElement, options: WidgetOptions) => {
    rendered.push(options);
    return `widget-${rendered.length}`;
  },
  remove: (id: string) => void removed.push(id),
}));
vi.mock("@/lib/challenge/turnstile-script", () => ({ loadTurnstile }));

const { VisitorCheck } = await import("./visitor-check");

const t = (key: string) =>
  key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en) as string;

function visit(strict = false) {
  const page = (
    <I18nContext.Provider
      value={{ t, locale: "en", setLocale: () => {} } as never}
    >
      <VisitorCheck>
        <p>the chat</p>
      </VisitorCheck>
    </I18nContext.Provider>
  );
  render(strict ? <StrictMode>{page}</StrictMode> : page);
}

const widget = () => rendered[rendered.length - 1]!;

beforeEach(() => {
  setAccount(null);
  vi.clearAllMocks();
  needsCheck = true;
  sessionFailure = null;
  rendered.length = 0;
  removed.length = 0;
  loadTurnstile.mockClear();
  delete document.documentElement.dataset.device;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the check before a visitor's chat", () => {
  it("shows the chat only once the widget has given its token", async () => {
    visit();

    await waitFor(() => expect(rendered).toHaveLength(1));
    expect(screen.queryByText("the chat")).toBeNull();
    expect(widget()).toMatchObject({
      sitekey: "site-key",
      action: "try",
      appearance: "interaction-only",
    });

    widget().callback("token");

    expect(await screen.findByText("the chat")).toBeTruthy();
    expect(removed).toEqual(["widget-1"]);
    expect(loadTurnstile).toHaveBeenCalledOnce();
  });

  it("is run once in StrictMode too, and the chat still opens", async () => {
    visit(true);

    await waitFor(() => expect(rendered.length).toBeGreaterThan(0));
    widget().callback("token");

    expect(await screen.findByText("the chat")).toBeTruthy();
  });

  it("never loads Turnstile when the session needs no check", async () => {
    needsCheck = false;

    visit();

    expect(await screen.findByText("the chat")).toBeTruthy();
    expect(loadTurnstile).not.toHaveBeenCalled();
  });

  it("says the check failed, and a retry runs it again", async () => {
    visit();
    await waitFor(() => expect(rendered).toHaveLength(1));

    widget()["error-callback"]();

    expect(await screen.findByText(t("try.checkFailed"))).toBeTruthy();
    expect(screen.queryByText("the chat")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(rendered).toHaveLength(2));
    widget().callback("second");

    expect(await screen.findByText("the chat")).toBeTruthy();
  });

  it("words a refused token as a failed check", async () => {
    sessionFailure = new ApiError("no", 403, {
      detail: { code: "challenge_failed" },
    });

    visit();

    expect(await screen.findByText(t("try.checkFailed"))).toBeTruthy();
  });

  it("words a check the server could not make as a try again", async () => {
    sessionFailure = new ApiError("down", 503, {
      detail: { code: "challenge_unavailable" },
    });

    visit();

    expect(await screen.findByText(t("chat.temporaryProblem"))).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("tells a TV to open graspy elsewhere when the check needs an answer, with no retry", async () => {
    document.documentElement.dataset.device = "tv";
    visit();
    await waitFor(() => expect(rendered).toHaveLength(1));

    widget()["before-interactive-callback"]();

    expect(await screen.findByText(t("try.needsAnotherDevice"))).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lets a computer's visitor answer an interactive check", async () => {
    visit();
    await waitFor(() => expect(rendered).toHaveLength(1));

    widget()["before-interactive-callback"]();
    widget().callback("token");

    expect(await screen.findByText("the chat")).toBeTruthy();
  });

  it("tells a browser that cannot run the widget to open graspy elsewhere", async () => {
    visit();
    await waitFor(() => expect(rendered).toHaveLength(1));

    widget()["unsupported-callback"]();

    expect(await screen.findByText(t("try.needsAnotherDevice"))).toBeTruthy();
  });

  it("tells a page built before the check to reload, with a button that does", async () => {
    sessionFailure = new ApiError("Reload the page to start.", 403, {
      detail: { code: "challenge_required" },
    });
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });

    visit();

    expect(await screen.findByText(t("try.reload"))).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("gives a second ask for the check the one already running, not a stranded one", async () => {
    visit();
    await waitFor(() => expect(rendered).toHaveLength(1));
    const { solveChallenge } = await import("@/lib/challenge/challenge");

    const second = solveChallenge();
    widget().callback("token");

    await expect(second).resolves.toBe("token");
    expect(rendered).toHaveLength(1);
    expect(await screen.findByText("the chat")).toBeTruthy();
  });

  it("shows an account's chat at once, asking for no session and loading no check", async () => {
    signedInAs({ id: "ada000000001", name: "Ada" });

    visit();

    expect(await screen.findByText("the chat")).toBeTruthy();
    const { chatTokens } = await import("@/lib/api/chat-session");
    expect(chatTokens.get).not.toHaveBeenCalled();
    expect(loadTurnstile).not.toHaveBeenCalled();
  });

  it("fails, with a retry, when the script cannot load", async () => {
    loadTurnstile.mockRejectedValueOnce(new Error("blocked"));

    visit();

    expect(await screen.findByText(t("try.checkFailed"))).toBeTruthy();
  });
});
