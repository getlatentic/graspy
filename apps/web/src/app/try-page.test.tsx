// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { takeChat } from "@/lib/account/chat-return";
import { isAnonymousSession } from "@/lib/api/session";
import {
  deleteCurriculum,
  getCurriculum,
  saveCurriculum,
} from "@/lib/curriculum-db";
import { I18nContext } from "@/lib/i18n-context";
import { getUserProfile } from "@/lib/user-storage";
import { signedInAs } from "@/test/account-session";
import en from "@/locales/en.json";

// Google is never reached: the visitor has no account, and this fails the test if it is asked.
const googleIdToken = vi.fn();
vi.mock("@/lib/account/google-auth", () => ({ googleIdToken }));
vi.mock("@/lib/device-id", () => ({
  deviceId: () => "0a1b2c3d4e5f60718293a4b5c6d7e8f9",
  fingerprint: async () => null,
}));
const syncPlan = vi.fn();
vi.mock("@/lib/plan-sync", () => ({ syncPlan }));
vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  FIREBASE_CONFIG: { apiKey: "key" },
}));
// The chat itself is the signed-in chat's, tested there; this shows which conversation it is given.
vi.mock("@/features/learn/components/chat-view", () => ({
  ChatView: ({ scope }: { scope: { kind: string } }) => (
    <p>chat of kind {scope.kind}</p>
  ),
}));

const { startTryChat } = await import("./try-link");
const { default: TryPage } = await import("./try-page");

const t = (key: string) =>
  key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en) as string;

function visit(path = "/try") {
  const router = createMemoryRouter(
    [
      { path: "/try", loader: startTryChat, Component: TryPage },
      { path: "/app", element: <p>the app</p> },
      { path: "/app/sign-in", element: <p>sign in</p> },
      { path: "/app/learners", element: <p>who is learning</p> },
      { path: "/app/learn/ask/general", element: <p>their own chat</p> },
    ],
    { initialEntries: [path] },
  );
  render(
    <I18nContext.Provider
      value={{ t, locale: "en", setLocale: () => {} } as never}
    >
      <RouterProvider router={router} />
    </I18nContext.Provider>,
  );
  return router;
}

// Nothing is served: what the page asks of the server is what is looked at.
const fetchMock = vi.fn();

beforeEach(async () => {
  fetchMock.mockReset();
  // A session is issued, and anything else is not reached.
  fetchMock.mockImplementation(async (url: string) => {
    if (!String(url).endsWith("/session")) throw new TypeError("offline");
    return new Response(JSON.stringify({ token: "t", expiresIn: 3600 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  sessionStorage.clear();
  setAccount(null);
  await deleteCurriculum();
  googleIdToken.mockReset();
  syncPlan.mockReset();
  syncPlan.mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/try with no account and no Google sign-in", () => {
  it("opens the general chat on the page, with no redirect to sign in", async () => {
    const router = visit();

    expect(await screen.findByText("chat of kind general")).toBeTruthy();

    expect(router.state.location.pathname).toBe("/try");
    expect(googleIdToken).not.toHaveBeenCalled();
    expect(takeChat()).toBeNull();
  });

  it("makes the visitor's profile and plan on the device only, asking no account", async () => {
    visit();
    await screen.findByText("chat of kind general");

    expect((await getCurriculum())?.subjects).toEqual([]);
    expect((await getCurriculum())?.startedInChat).toBe(true);
    expect(getUserProfile()).toMatchObject({
      language: "en",
      gradeLevel: "",
      onboardingCompleted: true,
    });
  });

  it("keeps the requests of the page anonymous while it is open, and the device's own after", async () => {
    visit();
    await screen.findByText("chat of kind general");
    expect(isAnonymousSession()).toBe(true);

    cleanup();

    expect(isAnonymousSession()).toBe(false);
  });

  it("keeps the plan and class a reload finds, making none over them", async () => {
    const plan = await saveCurriculum({
      country: "Nigeria",
      countryCode: "NG",
      language: "English",
      gradeLevel: "JSS 1 (Junior Secondary School), Nigeria, age 12",
      subjects: [{ name: "Mathematics", slug: "mathematics" }],
      topics: {},
      assessment: { nextSubject: null },
    });
    visit();
    await screen.findByText("chat of kind general");
    cleanup();

    visit();
    await screen.findByText("chat of kind general");

    const kept = await getCurriculum();
    expect(kept?.planId).toBe(plan.planId);
    expect(kept?.subjects).toEqual(plan.subjects);
  });

  it("makes one plan when it is open in two tabs at once", async () => {
    visit();
    visit();
    await waitFor(async () => expect(await getCurriculum()).not.toBeNull());
    const made = await getCurriculum();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect((await getCurriculum())?.planId).toBe(made?.planId);
    expect(screen.getAllByText("chat of kind general")).toHaveLength(2);
  });

  it("sends a device that has a class but no plan to the app, which makes it", async () => {
    localStorage.setItem(
      "graspy_user_profile",
      JSON.stringify({ gradeLevel: "JSS 1", onboardingCompleted: true }),
    );

    const router = visit();

    await waitFor(() => expect(router.state.location.pathname).toBe("/app"));
  });

  it("offers signing in, which comes back to /try", async () => {
    visit();
    await screen.findByText("chat of kind general");

    await userEvent.click(screen.getByRole("link", { name: "Sign in" }));

    expect(await screen.findByText("sign in")).toBeTruthy();
    expect(takeChat()).toBe("/try");
  });

  it("asks the server for no learner's record and names no device", async () => {
    visit();
    await screen.findByText("chat of kind general");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const asked = fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      body: String(init?.body ?? ""),
    }));
    expect(asked.filter(({ url }) => url.includes("/learner"))).toEqual([]);
    expect(asked.filter(({ body }) => body.includes("deviceId"))).toEqual([]);
  });

  it("offers no voice and no recording", async () => {
    visit();
    await screen.findByText("chat of kind general");

    expect(document.querySelector("audio, [aria-label*='oice' i]")).toBeNull();
    expect(screen.queryByText(/voice|record|microphone/i)).toBeNull();
  });
});

describe("/try once someone is signed in", () => {
  it("goes to their own chat when it is opened signed in", async () => {
    signedInAs({ id: "ada000000001", name: "Ada" });

    const router = visit();

    expect(await screen.findByText("their own chat")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/app/learn/ask/general");
  });

  it("goes to their own chat when they sign in while it is open", async () => {
    const router = visit();
    await screen.findByText("chat of kind general");

    act(() => signedInAs({ id: "ada000000001", name: "Ada" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/app/learn/ask/general"),
    );
  });
});
