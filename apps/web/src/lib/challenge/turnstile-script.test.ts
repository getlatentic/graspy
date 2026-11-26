// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const scripts = () =>
  [...document.head.querySelectorAll("script")].map((s) => s.src);

beforeEach(() => {
  vi.resetModules();
  document.head.innerHTML = "";
  delete window.turnstile;
});

describe("loading Turnstile", () => {
  it("adds no script until asked, then one from Cloudflare, however often it is asked", async () => {
    const { loadTurnstile, TURNSTILE_SCRIPT_URL } =
      await import("./turnstile-script");
    expect(scripts()).toEqual([]);

    void loadTurnstile().catch(() => {});
    void loadTurnstile().catch(() => {});

    expect(scripts()).toEqual([TURNSTILE_SCRIPT_URL]);
    expect(TURNSTILE_SCRIPT_URL).toMatch(
      /^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit$/,
    );
  });

  it("gives the widget API once the script has run", async () => {
    const { loadTurnstile } = await import("./turnstile-script");
    const api = { render: vi.fn(), remove: vi.fn() };

    const loaded = loadTurnstile();
    window.turnstile = api;
    document.head.querySelector("script")!.onload!(new Event("load"));

    await expect(loaded).resolves.toBe(api);
  });

  it("tries again after a load that failed", async () => {
    const { loadTurnstile } = await import("./turnstile-script");

    const first = loadTurnstile();
    document.head.querySelector("script")!.onerror!(new Event("error"));
    await expect(first).rejects.toThrow("did not load");

    void loadTurnstile().catch(() => {});
    expect(scripts()).toHaveLength(1);
  });
});
