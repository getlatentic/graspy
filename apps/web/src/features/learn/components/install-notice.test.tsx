// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import { INSTALL_DISMISSED_KEY, listenForInstall } from "@/lib/install";
import en from "@/locales/en.json";
import { InstallNotice } from "./install-notice";

const t = (key: string) =>
  key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en) as string;

function shown() {
  render(
    <I18nContext.Provider
      value={{ t, locale: "en", setLocale: () => {} } as never}
    >
      <InstallNotice />
    </I18nContext.Provider>,
  );
}

function chromeOffers() {
  const event = Object.assign(
    new Event("beforeinstallprompt", { cancelable: true }),
    {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    },
  );
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

beforeAll(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  listenForInstall();
});
afterEach(cleanup);

describe("the install notice", () => {
  it("shows nothing until the browser can install the app", () => {
    shown();

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers the install, opens the browser's dialog, and goes", async () => {
    shown();
    const event = chromeOffers();

    expect(screen.getByText("Install graspy")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
    });

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
    expect(window.localStorage.getItem(INSTALL_DISMISSED_KEY)).toBe("1");
  });
});
