// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { I18nContext } from "@/lib/i18n-context";
import en from "@/locales/en.json";

const api = vi.hoisted(() => ({
  lookUpTv: vi.fn(),
  approveTv: vi.fn(),
  denyTv: vi.fn(),
  listTvs: vi.fn(),
  removeTv: vi.fn(),
  listLearners: vi.fn(),
  account: { current: null as object | null },
}));
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

beforeEach(() => {
  window.location.hash = "";
  api.account.current = signedIn;
  api.lookUpTv.mockReset().mockResolvedValue(ASKED);
  api.approveTv.mockReset().mockResolvedValue(undefined);
  api.denyTv.mockReset().mockResolvedValue(undefined);
  api.listTvs.mockReset().mockResolvedValue([]);
  api.removeTv.mockReset().mockResolvedValue(undefined);
  api.listLearners.mockReset().mockResolvedValue([ADA]);
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
});

describe("giving the code", () => {
  it("fills the code in from the address a QR code opened, without sending it", async () => {
    window.location.hash = "#code=ABCD2345";
    page();

    const field = (await screen.findByLabelText(
      en.tvLink.code,
    )) as HTMLInputElement;

    expect(field.value).toBe("ABCD2345");
    expect(api.lookUpTv).not.toHaveBeenCalled();
  });

  it("is a field for a person: left to right, capitals, no autocorrect", async () => {
    page();

    const field = await screen.findByLabelText(en.tvLink.code);

    expect(field.getAttribute("dir")).toBe("ltr");
    expect(field.getAttribute("autocapitalize")).toBe("characters");
    expect(field.getAttribute("autocomplete")).toBe("off");
    expect(field.getAttribute("autocorrect")).toBe("off");
  });

  it("looks the code up and shows what is asking before anything is approved", async () => {
    page();
    await enterCode("abcd-2345");

    expect(
      await screen.findByRole("heading", {
        name: "Sign in on Samsung TV?",
      }),
    ).toBeTruthy();
    expect(api.lookUpTv).toHaveBeenCalledWith("ABCD2345");
    expect(screen.getByText("ABCD 2345")).toBeTruthy();
    expect(screen.getByText(/Nigeria/)).toBeTruthy();
    expect(screen.getByText(/1 minute ago/)).toBeTruthy();
    expect(api.approveTv).not.toHaveBeenCalled();
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

  it("says when there have been too many tries", async () => {
    api.lookUpTv.mockRejectedValue(new ApiError("slow", 429));
    page();
    await enterCode("ABCD2345");

    expect((await screen.findByRole("alert")).textContent).toBe(en.tvLink.busy);
  });
});

describe("approving and denying", () => {
  async function confirming() {
    page();
    await enterCode("ABCD2345");
    await screen.findByRole("button", { name: en.tvLink.approve });
  }

  it("approves for the learner of this phone and says so", async () => {
    await confirming();

    fireEvent.click(screen.getByRole("button", { name: en.tvLink.approve }));

    expect(
      await screen.findByRole("heading", { name: en.tvLink.done }),
    ).toBeTruthy();
    expect(api.approveTv).toHaveBeenCalledWith("ABCD2345", ADA.id);
  });

  it("refreshes the list of TVs after approving", async () => {
    await confirming();
    api.listTvs.mockClear();

    fireEvent.click(screen.getByRole("button", { name: en.tvLink.approve }));
    await screen.findByRole("heading", { name: en.tvLink.done });

    expect(api.listTvs).toHaveBeenCalledTimes(1);
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

  it("lets the person choose among the account's learners", async () => {
    api.listLearners.mockResolvedValue([ADA, BEN]);
    await confirming();

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Ben"));
    fireEvent.click(screen.getByRole("button", { name: en.tvLink.approve }));

    await screen.findByRole("heading", { name: en.tvLink.done });
    expect(api.approveTv).toHaveBeenCalledWith("ABCD2345", BEN.id);
  });

  it("offers to add a learner when the account has none, and cannot approve", async () => {
    api.listLearners.mockResolvedValue([]);
    await confirming();

    expect(
      screen.getByRole("link", { name: en.tvLink.addLearner }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: en.tvLink.approve,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("says a parent must agree when the server refuses a learner with no agreement", async () => {
    api.listLearners.mockResolvedValue([NO_CONSENT]);
    api.approveTv.mockRejectedValue(refused(403, "consent_required"));
    await confirming();

    fireEvent.click(screen.getByRole("button", { name: en.tvLink.approve }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      en.tvLink.consent,
    );
  });

  it("returns to the code when the approval is refused, with the reason", async () => {
    api.approveTv.mockRejectedValue(refused(409, "too_many_tvs"));
    await confirming();

    fireEvent.click(screen.getByRole("button", { name: en.tvLink.approve }));

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
