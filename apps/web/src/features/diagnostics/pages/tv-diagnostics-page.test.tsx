// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
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
afterEach(cleanup);

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

  it("logs the key, code, keyCode and repeat of what the remote sends", () => {
    page();
    key("keydown", { key: "Unidentified", code: "" }, 461);
    key("keyup", { key: "ArrowLeft", code: "ArrowLeft", repeat: false }, 37);
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
    const text = events()
      .getAllByRole("listitem")
      .map((l) => l.textContent)
      .join("\n");
    expect(text).toContain("pointerdown pointerType=mouse");
    expect(text).toContain("click");
    await user.tab();
    const lines = events()
      .getAllByRole("listitem")
      .map((l) => l.textContent);
    expect(
      lines.some((l) => /s focus button "Copy report"/.test(l ?? "")),
    ).toBe(true);
  });

  it("keeps the last 50 events and folds a flood of one kind into one line", () => {
    page();
    for (let i = 0; i < 80; i += 1)
      key("keydown", { key: "a", code: "KeyA" }, 65 + i);
    expect(events().getAllByRole("listitem")).toHaveLength(50);
    for (let i = 0; i < 5; i += 1) {
      act(() => {
        document.body.dispatchEvent(new Event("wheel", { bubbles: true }));
      });
    }
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
});
