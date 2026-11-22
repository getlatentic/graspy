// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function card(pads: () => unknown[], touch = 0) {
  vi.resetModules();
  Object.defineProperty(navigator, "maxTouchPoints", {
    configurable: true,
    value: touch,
  });
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: () => true,
  });
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: pads,
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const { HapticsCard } = await import("./haptics-card");
  const { KeysApp } = await import("@/test/keys-app");
  render(
    <KeysApp>
      <HapticsCard />
    </KeysApp>,
  );
}

const rumblePad = {
  connected: true,
  vibrationActuator: { playEffect: () => Promise.resolve("complete") },
};

describe("the vibration card", () => {
  it("is hidden on a desktop with no touch screen and no controller", async () => {
    await card(() => []);
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("shows on a touch screen", async () => {
    await card(() => [], 5);
    expect(screen.getByRole("switch")).toBeTruthy();
  });

  it("appears when a controller connects, and goes when it leaves", async () => {
    let pads: unknown[] = [];
    await card(() => pads);
    expect(screen.queryByRole("switch")).toBeNull();

    pads = [rumblePad];
    act(() => void window.dispatchEvent(new Event("gamepadconnected")));
    expect(screen.getByRole("switch")).toBeTruthy();

    pads = [];
    act(() => void window.dispatchEvent(new Event("gamepaddisconnected")));
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
