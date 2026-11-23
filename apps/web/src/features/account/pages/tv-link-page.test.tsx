// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    startParentSession: vi.fn(),
    signInAgain: vi.fn(),
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
  startParentSession: api.startParentSession,
}));
vi.mock("@/lib/account/sign-in", () => ({
  prepareSignIn: () => undefined,
  signInAgain: api.signInAgain,
}));
vi.mock("../hooks/use-google-sign-in", () => ({
  useGoogleSignIn: () => ({
    signIn: () => undefined,
    busy: false,
    problem: null,
  }),
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
const NO_CONSENT = {
  ...ADA,
  id: "c1b2c3d4e5f6",
  name: "Cy",
  serviceConsent: null,
};
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

async function enterCode(code: string) {
  fireEvent.change(await screen.findByLabelText(en.tvLink.code), {
    target: { value: code },
  });
  fireEvent.click(screen.getByRole("button", { name: en.tvLink.next }));
}

const endField = () => screen.findByLabelText(en.tvLink.endLabel);
const approveButton = () =>
  screen.getByRole("button", { name: en.tvLink.approve }) as HTMLButtonElement;

beforeEach(() => {
  window.location.hash = "";
  api.account.current = signedIn;
  api.parent.held = true;
  api.lookUpTv.mockReset().mockResolvedValue(ASKED);
  api.approveTv.mockReset().mockResolvedValue(undefined);
  api.denyTv.mockReset().mockResolvedValue(undefined);
  api.listTvs.mockReset().mockResolvedValue([]);
  api.removeTv.mockReset().mockResolvedValue(undefined);
  api.listLearners.mockReset().mockResolvedValue([ADA]);
  api.startParentSession.mockReset().mockImplementation(async () => {
    api.parent.held = true;
  });
  api.signInAgain.mockReset().mockResolvedValue("fresh-token");
});

afterEach(cleanup);

describe("signing in first", () => {
  it("asks a signed-out phone to sign in, and shows no code field", () => {
    api.account.current = null;
    page();

    expect(
      screen.getByRole("heading", { name: en.tvLink.signIn }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: en.you.signIn })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(api.lookUpTv).not.toHaveBeenCalled();
  });

  it("asks a signed-in phone to sign in again as the parent before anything of the TV is asked or shown", async () => {
    api.parent.held = false;
    page();

    expect(screen.getByText(en.tvLink.parent)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(api.listTvs).not.toHaveBeenCalled();
    expect(api.lookUpTv).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: en.you.signIn }));

    expect(await screen.findByLabelText(en.tvLink.code)).toBeTruthy();
    expect(api.startParentSession).toHaveBeenCalledWith("fresh-token");
    expect(api.listTvs).toHaveBeenCalled();
  });

  it("asks again when the parent's session is gone in the middle", async () => {
    api.lookUpTv.mockRejectedValue(new api.ParentSignInNeeded());
    page();
    await enterCode("ABCD2345");

    expect(await screen.findByText(en.tvLink.parent)).toBeTruthy();
  });
});

describe("giving the code", () => {
  it("keeps the code from a QR code out of sight: only its first four characters show", async () => {
    window.location.hash = "#code=ABCD2345";
    page();

    await screen.findByRole("heading", { name: en.tvLink.title });

    expect(screen.getByText(/ABCD\s•{4}/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.body.textContent).not.toContain("2345");
    expect(api.lookUpTv).not.toHaveBeenCalled();
  });

  it("looks the whole code from the link up when Next is pressed", async () => {
    window.location.hash = "#code=ABCD2345";
    page();
    await screen.findByRole("heading", { name: en.tvLink.title });

    fireEvent.click(screen.getByRole("button", { name: en.tvLink.next }));

    expect(await endField()).toBeTruthy();
    expect(api.lookUpTv).toHaveBeenCalledWith("ABCD2345");
  });

  it("falls back to typing when the code in the link was not valid", async () => {
    window.location.hash = "#code=ABCD2345";
    api.lookUpTv.mockRejectedValue(refused(404, "code_not_found"));
    page();
    await screen.findByRole("heading", { name: en.tvLink.title });
    fireEvent.click(screen.getByRole("button", { name: en.tvLink.next }));

    const field = (await screen.findByLabelText(
      en.tvLink.code,
    )) as HTMLInputElement;

    expect(field.value).toBe("");
    expect((await screen.findByRole("alert")).textContent).toBe(
      en.tvLink.invalid,
    );
  });

  it("is a field for a person: left to right, capitals, no autocorrect", async () => {
    page();

    const field = await screen.findByLabelText(en.tvLink.code);

    expect(field.getAttribute("dir")).toBe("ltr");
    expect(field.getAttribute("autocapitalize")).toBe("characters");
    expect(field.getAttribute("autocomplete")).toBe("off");
    expect(field.getAttribute("autocorrect")).toBe("off");
  });

  it("looks a typed code up as the server compares it", async () => {
    page();
    await enterCode("abcd-2345");

    await endField();

    expect(api.lookUpTv).toHaveBeenCalledWith("ABCD2345");
  });

  it("says when the code is not valid, and keeps what was typed", async () => {
    api.lookUpTv.mockRejectedValue(refused(404, "code_not_found"));
    page();
    await enterCode("ABCD2345");

    expect((await screen.findByRole("alert")).textContent).toBe(
      en.tvLink.invalid,
    );
    expect(
      (screen.getByLabelText(en.tvLink.code) as HTMLInputElement).value,
    ).toBe("ABCD2345");
  });

  it("says when another account is already linking this TV", async () => {
    api.lookUpTv.mockRejectedValue(refused(409, "code_in_use"));
    page();
    await enterCode("ABCD2345");

    expect((await screen.findByRole("alert")).textContent).toBe(
      en.tvLink.inUse,
    );
  });

  it("says when there have been too many tries", async () => {
    api.lookUpTv.mockRejectedValue(new ApiError("slow", 429));
    page();
    await enterCode("ABCD2345");

    expect((await screen.findByRole("alert")).textContent).toBe(en.tvLink.busy);
  });
});

describe("the confirmation", () => {
  async function confirming() {
    page();
    await enterCode("ABCD2345");
    return endField();
  }

  it("shows the device, where and when it asked, and says to continue only when looking at it", async () => {
    await confirming();

    expect(
      screen.getByRole("heading", { name: "Sign in on Samsung TV?" }),
    ).toBeTruthy();
    expect(screen.getByText(/Nigeria/)).toBeTruthy();
    expect(screen.getByText(/1 minute ago/)).toBeTruthy();
    expect(
      screen.getByText("Only continue if you are looking at this TV."),
    ).toBeTruthy();
    expect(api.approveTv).not.toHaveBeenCalled();
  });

  it("does not show the code, so the last four characters cannot be copied off the phone", async () => {
    await confirming();

    expect(document.body.textContent).not.toContain("2345");
    expect(document.body.textContent).not.toContain("ABCD");
  });

  it("keeps Approve off until the last four characters are typed", async () => {
    const field = await confirming();
    expect(approveButton().disabled).toBe(true);

    fireEvent.change(field, { target: { value: "23" } });
    expect(approveButton().disabled).toBe(true);
    fireEvent.change(field, { target: { value: "2345" } });

    expect(approveButton().disabled).toBe(false);
  });

  it("sends the last four characters as typed, capitalised, with the learner", async () => {
    const field = await confirming();
    fireEvent.change(field, { target: { value: " 23-45 " } });

    fireEvent.click(approveButton());

    expect(
      await screen.findByRole("heading", { name: en.tvLink.done }),
    ).toBeTruthy();
    expect(api.approveTv).toHaveBeenCalledWith("ABCD2345", ADA.id, "2345");
  });

  it("says plainly when the characters were not those on the TV, and lets them be typed again", async () => {
    api.approveTv.mockRejectedValue(refused(403, "confirm_mismatch"));
    const field = await confirming();
    fireEvent.change(field, { target: { value: "AAAA" } });

    fireEvent.click(approveButton());

    expect((await screen.findByRole("alert")).textContent).toBe(
      en.tvLink.wrongEnd,
    );
    expect(await endField()).toBeTruthy();
  });

  it("denies, and says so", async () => {
    await confirming();

    fireEvent.click(screen.getByRole("button", { name: en.tvLink.deny }));

    expect(
      await screen.findByRole("heading", { name: en.tvLink.denied }),
    ).toBeTruthy();
    expect(api.denyTv).toHaveBeenCalledWith("ABCD2345");
    expect(api.approveTv).not.toHaveBeenCalled();
  });

  it("tells the parent to confirm on the TV, and refreshes the list of TVs", async () => {
    const field = await confirming();
    api.listTvs.mockClear();
    fireEvent.change(field, { target: { value: "2345" } });

    fireEvent.click(approveButton());
    await screen.findByRole("heading", { name: en.tvLink.done });

    expect(en.tvLink.done).toBe("Now confirm on your TV.");
    expect(api.listTvs).toHaveBeenCalledTimes(1);
  });

  it("lets the person choose among the account's learners", async () => {
    api.listLearners.mockResolvedValue([ADA, BEN]);
    const field = await confirming();
    fireEvent.change(field, { target: { value: "2345" } });

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Ben"));
    fireEvent.click(approveButton());

    await screen.findByRole("heading", { name: en.tvLink.done });
    expect(api.approveTv).toHaveBeenCalledWith("ABCD2345", BEN.id, "2345");
  });

  it("offers to add a learner when the account has none, and cannot approve", async () => {
    api.listLearners.mockResolvedValue([]);
    const field = await confirming();
    fireEvent.change(field, { target: { value: "2345" } });

    expect(
      screen.getByRole("link", { name: en.tvLink.addLearner }),
    ).toBeTruthy();
    expect(approveButton().disabled).toBe(true);
  });

  it("says a parent must agree when the server refuses a learner with no agreement", async () => {
    api.listLearners.mockResolvedValue([NO_CONSENT]);
    api.approveTv.mockRejectedValue(refused(403, "consent_required"));
    const field = await confirming();
    fireEvent.change(field, { target: { value: "2345" } });

    fireEvent.click(approveButton());

    expect((await screen.findByRole("alert")).textContent).toBe(
      en.tvLink.consent,
    );
  });

  it("returns to the code when there are too many TVs, with the reason", async () => {
    api.approveTv.mockRejectedValue(refused(409, "too_many_tvs"));
    const field = await confirming();
    fireEvent.change(field, { target: { value: "2345" } });

    fireEvent.click(approveButton());

    expect((await screen.findByRole("alert")).textContent).toBe(en.tvLink.full);
  });
});

describe("the account's TVs", () => {
  it("lists them with a way to remove each, and removes one", async () => {
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

  it("shows no list when there are none", async () => {
    page();
    await screen.findByLabelText(en.tvLink.code);

    expect(screen.queryByText(en.tvLink.tvs)).toBeNull();
  });
});
