// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import SignInPage from "./sign-in-page";

vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  FIREBASE_CONFIG: {},
}));
vi.mock("@/lib/account/use-account", () => ({ useAccount: () => null }));
const signIn = vi.fn();
vi.mock("../hooks/use-google-sign-in", () => ({
  useGoogleSignIn: () => ({ signIn, busy: false, problem: null }),
}));

afterEach(cleanup);

describe("the sign-in screen with a keyboard or a remote", () => {
  it("reaches both ways in with Tab, in order, and OK presses the focused one", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <I18nContext.Provider
          value={{ locale: "en", setLocale: () => undefined, t: (key) => key }}
        >
          <SignInPage />
        </I18nContext.Provider>
      </MemoryRouter>,
    );
    await user.tab();
    const google = screen.getByRole("button", { name: "you.signIn" });
    expect(document.activeElement).toBe(google);
    await user.keyboard("{Enter}");
    expect(signIn).toHaveBeenCalledOnce();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "signIn.start" }),
    );
  });
});
