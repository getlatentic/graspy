// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { SERVICE_NOTICE } from "@/lib/account/consent-notices";
import { KeysApp } from "@/test/keys-app";
import { AGREED, listed, refused, signedInAs } from "@/test/account-session";

const { listLearners, renameLearner, agreeToService, signInAgain } = vi.hoisted(
  () => ({
    listLearners: vi.fn(),
    renameLearner: vi.fn(),
    agreeToService: vi.fn(),
    signInAgain: vi.fn(),
  }),
);
vi.mock("@/lib/account/learners-api", () => ({
  listLearners,
  renameLearner,
  agreeToService,
}));
vi.mock("@/lib/account/learner-choice", () => ({ forgetLearner: vi.fn() }));
vi.mock("@/lib/account/sign-in", async (original) => ({
  ...(await original<typeof import("@/lib/account/sign-in")>()),
  prepareSignIn: () => undefined,
  signInAgain,
}));

const { default: LearnersPage } = await import("./learners-page");

const ADA = listed("a00000000001", "Ada", AGREED);
const GRACE = listed("b00000000002", "Grace", null);

function manage() {
  render(
    <KeysApp>
      <LearnersPage />
    </KeysApp>,
  );
}

const rowOf = async (name: string) =>
  (await screen.findByText(name)).closest("li")!;

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  signedInAs({ id: ADA.id, name: "Ada" });
  listLearners.mockResolvedValue([ADA, GRACE]);
  signInAgain.mockResolvedValue("fresh-token");
  agreeToService.mockResolvedValue(AGREED);
});

afterEach(() => {
  cleanup();
  setAccount(null);
});

describe("managing the account's learners", () => {
  it("leads each learner to their voice recordings", async () => {
    manage();

    const link = within(await rowOf("Grace")).getByRole("link", {
      name: "learners.recordings",
    });

    expect(link.getAttribute("href")).toBe(
      "/app/learn/you/learners/b00000000002/voice",
    );
  });

  it("marks only the learner nobody has agreed for", async () => {
    manage();

    expect(
      within(await rowOf("Grace")).getByText("consent.needed"),
    ).toBeTruthy();
    expect(within(await rowOf("Ada")).queryByText("consent.needed")).toBeNull();
  });

  it("lets a parent agree for them, with the notice and a fresh sign-in", async () => {
    manage();
    const grace = await rowOf("Grace");

    fireEvent.click(
      within(grace).getByRole("button", { name: "consent.agreeRow" }),
    );
    expect(await screen.findByText(SERVICE_NOTICE)).toBeTruthy();
    expect(agreeToService).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "consent.agree" }));

    await waitFor(() =>
      expect(
        within(screen.getByText("Grace").closest("li")!).queryByText(
          "consent.needed",
        ),
      ).toBeNull(),
    );
    expect(agreeToService).toHaveBeenCalledWith(GRACE.id, {
      noticeVersion: 1,
      firebaseIdToken: "fresh-token",
    });
  });

  it("leaves them marked when the server refuses the agreement", async () => {
    agreeToService.mockRejectedValueOnce(refused(401, "sign_in_stale"));
    manage();
    const grace = await rowOf("Grace");
    fireEvent.click(
      within(grace).getByRole("button", { name: "consent.agreeRow" }),
    );
    await screen.findByText(SERVICE_NOTICE);

    fireEvent.click(screen.getByRole("button", { name: "consent.agree" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "consent.signIn",
    );
  });

  it("leaves them marked when the parent declines", async () => {
    manage();
    const grace = await rowOf("Grace");
    fireEvent.click(
      within(grace).getByRole("button", { name: "consent.agreeRow" }),
    );
    await screen.findByText(SERVICE_NOTICE);

    fireEvent.click(screen.getByRole("button", { name: "consent.decline" }));

    expect(
      within(await rowOf("Grace")).getByText("consent.needed"),
    ).toBeTruthy();
    expect(agreeToService).not.toHaveBeenCalled();
  });

  it("keeps what a parent agreed to when a learner is renamed", async () => {
    renameLearner.mockResolvedValue({
      id: ADA.id,
      name: "Ada L.",
      createdAt: 1,
    });
    manage();
    const ada = await rowOf("Ada");

    fireEvent.click(
      within(ada).getByRole("button", { name: "learners.rename" }),
    );
    fireEvent.change(screen.getByLabelText("learners.nameLabel"), {
      target: { value: "Ada L." },
    });
    fireEvent.click(screen.getByRole("button", { name: "learners.save" }));

    const renamed = await rowOf("Ada L.");
    expect(within(renamed).queryByText("consent.needed")).toBeNull();
    expect(
      within(renamed).queryByRole("button", { name: "consent.agreeRow" }),
    ).toBeNull();
  });
});
