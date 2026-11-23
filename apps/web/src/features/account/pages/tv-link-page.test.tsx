// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";

const api = vi.hoisted(() => {
  class ParentSignInNeeded extends Error {}
  return {
    ParentSignInNeeded,
    lookUpTv: vi.fn(),
    approveTv: vi.fn(),
    denyTv: vi.fn(),
    listTvs: vi.fn(),
    removeTv: vi.fn(),
    listLearners: vi.fn(),
    signInAsParent: vi.fn(),
    parent: { held: true },
    account: { current: null as object | null },
  };
});
vi.mock("@/lib/account/tv-link-api", () => ({
  lookUpTv: api.lookUpTv,
  approveTv: api.approveTv,
  denyTv: api.denyTv,
  listTvs: api.listTvs,
  removeTv: api.removeTv,
}));
vi.mock("@/lib/account/learners-api", () => ({
  listLearners: api.listLearners,
}));
vi.mock("@/lib/account/use-account", () => ({
  useAccount: () => api.account.current,
}));
vi.mock("@/lib/api/session", () => ({
  ParentSignInNeeded: api.ParentSignInNeeded,
  hasParentSession: () => api.parent.held,
  parentSessionEnds: () => null,
  startParentSession: vi.fn(),
}));
vi.mock("@/lib/account/sign-in", () => ({
  prepareSignIn: () => undefined,
  signInAsParent: api.signInAsParent,
  signInProblem: (error: unknown) =>
    (error as { code?: string } | null)?.code === "auth/popup-blocked"
      ? "popupBlocked"
      : "failed",
}));

import TvLinkPage from "./tv-link-page";

const ADA = {
  id: "a1b2c3d4e5f6",
  name: "Ada",
  createdAt: 1,
  serviceConsent: { noticeVersion: 1, grantedAt: 1 },
  voiceConsent: null,
};
const BEN = { ...ADA, id: "b1b2c3d4e5f6", name: "Ben" };
const ASKED = {
  label: "Samsung TV",
  country: "NG",
  createdAt: Date.now() - 60_000,
  expiresAt: Date.now() + 540_000,
};

const lookup = (key: string, values?: Record<string, string | number>) => {
  const message = key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en) as string;
  return message.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name]));
};

function page() {
  return render(
    <MemoryRouter>
      <I18nContext.Provider
        value={{ t: lookup, locale: "en", setLocale: () => {} } as never}
      >
        <TvLinkPage />
      </I18nContext.Provider>
    </MemoryRouter>,
  );
}

const signedIn = { uid: "uid-1", learner: { id: ADA.id, name: "Ada" } };
const refused = (status: number, code: string) =>
  new ApiError("refused", status, { detail: { code } });

const boxes = () => screen.findAllByRole("textbox");
const google = () => screen.queryByRole("button", { name: en.you.signIn });

/** Types characters one at a time, as a keyboard does, into the boxes of the group. */
function typeInto(fields: HTMLElement[], text: string) {
  [...text].forEach((character, index) =>
    fireEvent.change(fields[index], { target: { value: character } }),
  );
}

beforeEach(() => {
  window.location.hash = "#code=ABCD2345";
  api.account.current = signedIn;
  api.parent.held = true;
  api.lookUpTv.mockReset().mockResolvedValue(ASKED);
  api.approveTv.mockReset().mockResolvedValue(undefined);
  api.denyTv.mockReset().mockResolvedValue(undefined);
  api.listTvs.mockReset().mockResolvedValue([]);
  api.removeTv.mockReset().mockResolvedValue(undefined);
  api.listLearners.mockReset().mockResolvedValue([ADA]);
  api.signInAsParent.mockReset().mockImplementation(async () => {
    api.account.current = signedIn;
    api.parent.held = true;
  });
});

afterEach(cleanup);

describe("signing in once", () => {
  beforeEach(() => {
    api.account.current = null;
    api.parent.held = false;
  });

  it("shows one Google button and nothing else to do before it: no code field, no second sign-in", () => {
    page();

    expect(screen.getByRole("heading", { name: en.tvLink.title })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(google()).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(api.lookUpTv).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/again/i);
  });

  it("goes straight to the TV with the code from the link when the one sign-in is done, with no second sign-in", async () => {
    page();

    fireEvent.click(google()!);

    expect(
      await screen.findByRole("heading", { name: "Link Samsung TV?" }),
    ).toBeTruthy();
    expect(api.signInAsParent).toHaveBeenCalledTimes(1);
    expect(api.lookUpTv).toHaveBeenCalledWith("ABCD2345");
    expect(google()).toBeNull();
    expect(document.body.textContent).not.toMatch(/again/i);
  });

  it("is the same one button when the phone is signed in but not as the parent", () => {
    api.account.current = signedIn;
    page();

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(google()).toBeTruthy();
  });

  it("says a blocked sign-in window plainly, and offers the button again", async () => {
    api.signInAsParent.mockRejectedValue(
      Object.assign(new Error("blocked"), { code: "auth/popup-blocked" }),
    );
    page();

    fireEvent.click(google()!);

    expect((await screen.findByRole("alert")).textContent).toBe(
      en.you.signInBlocked,
    );
    expect(google()).toBeTruthy();
  });

  it("asks for nothing when Google's window is closed", async () => {
    api.signInAsParent.mockRejectedValue(new Error("closed"));
    page();

    fireEvent.click(google()!);

    expect((await screen.findByRole("alert")).textContent).toBe(
      en.you.signInFailed,
    );
  });
});

describe("a parent who is already signed in", () => {
  it("is not asked to sign in at all, and the code in the link is looked up on its own", async () => {
    page();

    expect(
      await screen.findByRole("heading", { name: "Link Samsung TV?" }),
    ).toBeTruthy();
    expect(google()).toBeNull();
    expect(api.signInAsParent).not.toHaveBeenCalled();
    expect(api.lookUpTv).toHaveBeenCalledTimes(1);
    expect(api.lookUpTv).toHaveBeenCalledWith("ABCD2345");
  });

  it("is sent back to the one sign-in when the parent's session ends in the middle", async () => {
    api.lookUpTv.mockImplementation(async () => {
      api.parent.held = false;
      throw new api.ParentSignInNeeded();
    });
    page();

    expect(
      await screen.findByRole("button", { name: en.you.signIn }),
    ).toBeTruthy();
  });
});

describe("typing the last four characters", () => {
  async function confirming() {
    page();
    return boxes();
  }

  it("shows the device, where and when it asked, and four boxes, the first focused, and no button to approve", async () => {
    const fields = await confirming();

    expect(fields).toHaveLength(4);
    expect(document.activeElement).toBe(fields[0]);
    expect(screen.getByText(/Nigeria/)).toBeTruthy();
    expect(screen.getByText(/1 minute ago/)).toBeTruthy();
    expect(screen.getByText(en.tvLink.endLabel)).toBeTruthy();
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual([en.tvLink.deny]);
  });

  it("does not show the code, so the characters cannot be copied off the phone", async () => {
    await confirming();

    expect(document.body.textContent).not.toContain("2345");
    expect(document.body.textContent).not.toContain("ABCD");
  });

  it("approves by itself on the fourth character, upper case, for the learner, and not before", async () => {
    const fields = await confirming();

    typeInto(fields, "5h9");
    expect(api.approveTv).not.toHaveBeenCalled();
    fireEvent.change(fields[3], { target: { value: "w" } });

    await waitFor(() =>
      expect(api.approveTv).toHaveBeenCalledWith("ABCD2345", ADA.id, "5H9W"),
    );
    expect(api.approveTv).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("heading", { name: en.tvLink.done }),
    ).toBeTruthy();
  });

  it("moves to the next box as each character is typed", async () => {
    const fields = await confirming();

    fireEvent.change(fields[0], { target: { value: "5" } });
    expect(document.activeElement).toBe(fields[1]);
    fireEvent.change(fields[1], { target: { value: "H" } });
    expect(document.activeElement).toBe(fields[2]);
  });

  it("goes back a box on Backspace in an empty one", async () => {
    const fields = await confirming();
    typeInto(fields, "5");
    expect(document.activeElement).toBe(fields[1]);

    fireEvent.keyDown(fields[1], { key: "Backspace" });

    expect(document.activeElement).toBe(fields[0]);
  });

  it("takes a paste of all four, with spaces and lower case, and approves", async () => {
    const fields = await confirming();

    fireEvent.paste(fields[0], {
      clipboardData: { getData: () => " 5h-9w " },
    });

    await waitFor(() =>
      expect(api.approveTv).toHaveBeenCalledWith("ABCD2345", ADA.id, "5H9W"),
    );
  });

  it("takes a keyboard's autofill of all four into the first box", async () => {
    const fields = await confirming();

    fireEvent.change(fields[0], { target: { value: "5H9W" } });

    await waitFor(() =>
      expect(api.approveTv).toHaveBeenCalledWith("ABCD2345", ADA.id, "5H9W"),
    );
  });

  it("says plainly when the characters were wrong, clears the boxes and lets them be typed again", async () => {
    api.approveTv.mockRejectedValueOnce(refused(403, "confirm_mismatch"));
    const fields = await confirming();
    typeInto(fields, "AAAA");

    expect((await screen.findByRole("alert")).textContent).toBe(
      en.tvLink.wrongEnd,
    );
    const again = await boxes();
    expect(again.map((box) => (box as HTMLInputElement).value)).toEqual([
      "",
      "",
      "",
      "",
    ]);
    expect(document.activeElement).toBe(again[0]);
    typeInto(again, "5H9W");
    await waitFor(() => expect(api.approveTv).toHaveBeenCalledTimes(2));
  });

  it("denies on 'Not my TV', and says so", async () => {
    await confirming();

    fireEvent.click(screen.getByRole("button", { name: en.tvLink.deny }));

    expect(
      await screen.findByRole("heading", { name: en.tvLink.denied }),
    ).toBeTruthy();
    expect(api.denyTv).toHaveBeenCalledWith("ABCD2345");
    expect(api.approveTv).not.toHaveBeenCalled();
  });

  it("lets the person choose among the account's learners before typing", async () => {
    api.listLearners.mockResolvedValue([ADA, BEN]);
    const fields = await confirming();

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Ben"));
    typeInto(fields, "5H9W");

    await waitFor(() =>
      expect(api.approveTv).toHaveBeenCalledWith("ABCD2345", BEN.id, "5H9W"),
    );
  });

  it("offers to add a learner when the account has none, and has no boxes", async () => {
    api.listLearners.mockResolvedValue([]);
    page();

    expect(
      await screen.findByRole("link", { name: en.tvLink.addLearner }),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("says a parent must agree when the server refuses a learner with no agreement", async () => {
    api.approveTv.mockRejectedValue(refused(403, "consent_required"));
    const fields = await confirming();
    typeInto(fields, "5H9W");

    expect((await screen.findByRole("alert")).textContent).toBe(
      en.tvLink.consent,
    );
  });

  it("says there are too many TVs, with the reason", async () => {
    api.approveTv.mockRejectedValue(refused(409, "too_many_tvs"));
    const fields = await confirming();
    typeInto(fields, "5H9W");

    expect((await screen.findByRole("alert")).textContent).toBe(en.tvLink.full);
  });

  it("refreshes the list of TVs after approving", async () => {
    const fields = await confirming();
    api.listTvs.mockClear();
    typeInto(fields, "5H9W");

    await screen.findByRole("heading", { name: en.tvLink.done });

    expect(api.listTvs).toHaveBeenCalledTimes(1);
  });
});

describe("a link with no code, or a code that is no good", () => {
  it("asks for the whole code in eight boxes, and looks it up on the eighth", async () => {
    window.location.hash = "";
    page();

    const fields = await boxes();
    expect(fields).toHaveLength(8);
    expect(api.lookUpTv).not.toHaveBeenCalled();
    typeInto(fields, "abcd2345");

    expect(await screen.findAllByRole("textbox")).toHaveLength(4);
    expect(api.lookUpTv).toHaveBeenCalledWith("ABCD2345");
  });

  it("falls back to typing it when the code in the link was not valid, with the reason", async () => {
    api.lookUpTv.mockRejectedValue(refused(404, "code_not_found"));
    page();

    expect(await screen.findAllByRole("textbox")).toHaveLength(8);
    expect((await screen.findByRole("alert")).textContent).toBe(
      en.tvLink.invalid,
    );
  });

  it("says when another account is already linking this TV", async () => {
    api.lookUpTv.mockRejectedValue(refused(409, "code_in_use"));
    page();

    expect((await screen.findByRole("alert")).textContent).toBe(
      en.tvLink.inUse,
    );
  });

  it("says when there have been too many tries", async () => {
    api.lookUpTv.mockRejectedValue(new ApiError("slow", 429));
    page();

    expect((await screen.findByRole("alert")).textContent).toBe(en.tvLink.busy);
  });
});

describe("the account's TVs", () => {
  it("lists them with a way to remove each, and removes one", async () => {
    window.location.hash = "";
    api.listTvs.mockResolvedValue([
      {
        id: "tv1",
        label: "Samsung TV",
        learner: { id: ADA.id, name: "Ada" },
        createdAt: 1,
        lastUsedAt: Date.now() - 7_200_000,
      },
    ]);
    page();

    expect(await screen.findByText("Samsung TV · Ada")).toBeTruthy();
    expect(screen.getByText("2 hours ago")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove Samsung TV" }));

    expect(api.removeTv).toHaveBeenCalledWith("tv1");
  });
});
