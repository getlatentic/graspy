// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/locales/en.json";

const t = (key: string) =>
  key
    .split(".")
    .reduce<unknown>((value, part) => (value as never)?.[part], en) as string;

const DISMISSED = "graspy_install_dismissed";

// The install state is the page's, kept in a module; each test is a fresh page.
async function freshPage() {
  vi.resetModules();
  window.localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const { I18nContext } = await import("@/lib/i18n-context");
  const { listenForInstall } = await import("@/lib/install");
  const { InstallNotice } = await import("./install-notice");
  listenForInstall();
  return render(
    <I18nContext.Provider
      value={{ t, locale: "en", setLocale: () => {} } as never}
    >
      <InstallNotice />
    </I18nContext.Provider>,
  );
}

function chromeOffers(outcome: "accepted" | "dismissed") {
  const event = Object.assign(
    new Event("beforeinstallprompt", { cancelable: true }),
    {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome }),
    },
  );
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

// Each page adds its own listeners to the window; the ones of earlier pages must not answer.
const added: [string, EventListener][] = [];
beforeEach(() => {
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation(
    (
      type: string,
      listener: EventListenerOrEventListenerObject,
      o?: unknown,
    ) => {
      added.push([type, listener as EventListener]);
      add(type, listener, o as never);
    },
  );
});
afterEach(() => {
  cleanup();
  for (const [type, listener] of added)
    window.removeEventListener(type, listener);
  added.length = 0;
});

describe("the install notice", () => {
  it("shows nothing until the browser offers the install, then offers it", async () => {
    const { container } = await freshPage();

    expect(container.firstChild).toBeNull();
    chromeOffers("accepted");

    expect(screen.getByText("Install graspy")).toBeTruthy();
  });

  it("opens the browser's dialog and goes once the install is accepted", async () => {
    await freshPage();
    const event = chromeOffers("accepted");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
    });

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
    expect(window.localStorage.getItem(DISMISSED)).toBe("1");
  });

  it("stays, and remembers nothing, when the dialog is cancelled", async () => {
    await freshPage();
    chromeOffers("dismissed");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
    });

    expect(screen.getByRole("button", { name: "Install" })).toBeTruthy();
    expect(window.localStorage.getItem(DISMISSED)).toBeNull();
  });

  it("goes, for good, when hidden", async () => {
    await freshPage();
    chromeOffers("accepted");

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));

    expect(screen.queryByText("Install graspy")).toBeNull();
    expect(window.localStorage.getItem(DISMISSED)).toBe("1");
  });
});
