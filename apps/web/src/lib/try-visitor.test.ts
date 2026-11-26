import { beforeEach, describe, expect, it, vi } from "vitest";

function storage(refuses: boolean) {
  const kept = new Map<string, string>();
  return {
    kept,
    getItem: (key: string) => {
      if (refuses) throw new Error("blocked");
      return kept.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (refuses) throw new Error("blocked");
      kept.set(key, value);
    },
  };
}

async function load() {
  vi.resetModules();
  return (await import("./try-visitor")).tryVisitor;
}

function browser(local: ReturnType<typeof storage>, tab = storage(false)) {
  vi.stubGlobal("window", { localStorage: local, sessionStorage: tab });
  return tab;
}

beforeEach(() => vi.unstubAllGlobals());

describe("the visitor id", () => {
  it("is kept for good, and the same after a reload", async () => {
    const local = storage(false);
    browser(local);

    const first = (await load())();
    const reloaded = (await load())();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(reloaded).toBe(first);
    expect(local.kept.size).toBe(1);
  });

  it("is kept for the tab when storage for good is blocked, so a reload is the same visitor", async () => {
    const tab = browser(storage(true));

    const first = (await load())();
    const reloaded = (await load())();

    expect(reloaded).toBe(first);
    expect([...tab.kept.values()]).toEqual([first]);
  });

  it("is the same for the page when no storage works, and is never an error", async () => {
    browser(storage(true), storage(true));
    const tryVisitor = await load();

    expect(tryVisitor()).toBe(tryVisitor());
    expect(tryVisitor()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("falls back to the tab when only writing for good is blocked", async () => {
    const local = storage(false);
    local.setItem = () => {
      throw new Error("full");
    };
    const tab = browser(local);

    const first = (await load())();
    const reloaded = (await load())();

    expect(reloaded).toBe(first);
    expect(tab.kept.size).toBe(1);
  });
});
