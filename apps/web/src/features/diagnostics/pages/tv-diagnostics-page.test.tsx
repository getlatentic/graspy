// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { installRemoteInput } from "@/lib/remote-input";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TvDiagnosticsPage from "./tv-diagnostics-page";

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("pointer: fine") || query.includes("landscape"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});
let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
  cleanup();
});

const page = () =>
  render(
    <MemoryRouter>
      <TvDiagnosticsPage />
    </MemoryRouter>,
  );

function key(type: "keydown" | "keyup", init: KeyboardEventInit, code = 0) {
  const event = new KeyboardEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, "keyCode", { value: code });
  act(() => {
    document.body.dispatchEvent(event);
  });
}

/** The list is redrawn at most once a frame. */
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });

const events = () => within(screen.getByRole("list"));

describe("the TV diagnostics page", () => {
  it("shows the environment and the feature checks", () => {
    page();
    expect(
      screen.getByRole("heading", { name: "TV diagnostics" }),
    ).toBeTruthy();
    for (const name of [
      "User agent",
      "Window",
      "Pixel ratio",
      "Root font size",
      "Orientation",
      "Pointer",
      "Hover",
      "fetch",
      "localStorage",
      "serviceWorker",
      "AudioContext",
      "wakeLock",
      "MediaSource",
      "AbortSignal.timeout",
      "structuredClone",
      "CSS container queries",
    ]) {
      expect(screen.getByText(name), name).toBeTruthy();
    }
  });

  it("logs the key, code, keyCode and repeat of what the remote sends", async () => {
    page();
    key("keydown", { key: "Unidentified", code: "" }, 461);
    key("keyup", { key: "ArrowLeft", code: "ArrowLeft", repeat: false }, 37);
    await settle();
    const lines = events()
      .getAllByRole("listitem")
      .map((l) => l.textContent);
    expect(lines[0]).toContain(
      'keyup key="ArrowLeft" code="ArrowLeft" keyCode=37 repeat=false',
    );
    expect(lines[1]).toContain(
      'keydown key="Unidentified" code="" keyCode=461',
    );
  });

  it("logs a pointer's type and the control that takes focus", async () => {
    const user = userEvent.setup();
    page();
    await user.click(screen.getByRole("heading", { name: "TV diagnostics" }));
    await settle();
    const text = events()
      .getAllByRole("listitem")
      .map((l) => l.textContent)
      .join("\n");
    expect(text).toContain("pointerdown pointerType=mouse");
    expect(text).toContain("click");
    await user.tab();
    await settle();
    const lines = events()
      .getAllByRole("listitem")
      .map((l) => l.textContent);
    expect(lines.some((l) => /s focus button "Leave"/.test(l ?? ""))).toBe(
      true,
    );
  });

  it("keeps the last 50 events and folds a flood of one kind into one line", async () => {
    page();
    for (let i = 0; i < 80; i += 1)
      key("keydown", { key: "a", code: "KeyA" }, 65 + i);
    await settle();
    expect(events().getAllByRole("listitem")).toHaveLength(50);
    for (let i = 0; i < 5; i += 1) {
      act(() => {
        document.body.dispatchEvent(new Event("wheel", { bubbles: true }));
      });
    }
    await settle();
    expect(events().getAllByRole("listitem")[0].textContent).toContain(
      "wheel x5",
    );
  });

  it("copies the report as text", async () => {
    const user = userEvent.setup();
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: write },
      configurable: true,
    });
    page();
    key("keydown", { key: "Enter", code: "Enter" }, 13);
    await settle();
    await user.click(screen.getByRole("button", { name: "Copy report" }));
    const report = write.mock.calls[0][0] as string;
    expect(report).toContain("graspy TV diagnostics");
    expect(report).toContain("Environment");
    expect(report).toContain("User agent:");
    expect(report).toContain("AbortSignal.timeout:");
    expect(report).toContain('keydown key="Enter"');
    expect(screen.getByRole("status").textContent).toBe("Copied.");
  });

  it("says so when copying is not available", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("no")) },
      configurable: true,
    });
    document.execCommand = () => false;
    page();
    await user.click(screen.getByRole("button", { name: "Copy report" }));
    expect(screen.getByRole("status").textContent).toContain("not available");
  });

  it("puts Leave first in the tab order", async () => {
    const user = userEvent.setup();
    page();
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Leave");
  });

  it("swallows the first Back and leaves on the second", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/tv-diagnostics"]}>
        <Routes>
          <Route path="/tv-diagnostics" element={<TvDiagnosticsPage />} />
          <Route path="/" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const back = () => {
      const event = new KeyboardEvent("keydown", { bubbles: true });
      Object.defineProperty(event, "keyCode", { value: 461 });
      act(() => {
        document.dispatchEvent(event);
      });
    };
    stop = installRemoteInput(document);
    await user.tab();
    back();
    expect(screen.getByRole("status").textContent).toContain("Back again");
    expect(screen.queryByText("home")).toBeNull();
    back();
    expect(screen.getByText("home")).toBeTruthy();
  });

  it("redraws the facts neither for a pointer move nor for a key", async () => {
    page();
    const table = screen.getByText("Environment").closest("section")!;
    const before = table.innerHTML;
    const dd = table.querySelector("dd")!;
    for (let i = 0; i < 20; i += 1) {
      act(() => {
        document.body.dispatchEvent(
          new Event("pointermove", { bubbles: true }),
        );
      });
    }
    await settle();
    expect(table.querySelector("dd")).toBe(dd);
    expect(table.innerHTML).toBe(before);
  });
});
