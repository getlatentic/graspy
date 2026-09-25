import { beforeEach, describe, expect, it, vi } from "vitest";
import { prefetchPages, recoverFromStaleChunk } from "./page-chunks";

let reload: ReturnType<typeof vi.fn>;
let store: Map<string, string>;

function stubBrowser({ online = true } = {}) {
  store = new Map();
  reload = vi.fn();
  vi.stubGlobal("navigator", { onLine: online });
  vi.stubGlobal("window", {
    location: { reload },
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  });
}

function preloadError() {
  return { preventDefault: vi.fn() } as unknown as Event & {
    preventDefault: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  stubBrowser();
});

describe("recoverFromStaleChunk", () => {
  it("reloads to fetch the new build, and keeps the error from surfacing", () => {
    const event = preloadError();

    expect(recoverFromStaleChunk(event, 1_000_000)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("does not reload again for a failure that follows the reload, but does for a later deploy", () => {
    recoverFromStaleChunk(preloadError(), 1_000_000);
    const second = preloadError();

    expect(recoverFromStaleChunk(second, 1_009_999)).toBe(false);
    expect(second.preventDefault).not.toHaveBeenCalled();
    expect(recoverFromStaleChunk(preloadError(), 1_010_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("leaves an offline failure to the error screen", () => {
    stubBrowser({ online: false });
    const event = preloadError();

    expect(recoverFromStaleChunk(event, 1_000_000)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("still reloads once when storage is denied", () => {
    const denied = () => {
      throw new Error("denied");
    };
    vi.stubGlobal("window", {
      location: { reload },
      sessionStorage: { getItem: denied, setItem: denied },
    });

    expect(recoverFromStaleChunk(preloadError(), 1_000_000)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });
});

describe("prefetchPages", () => {
  it("ignores a failed download, and reloads only once it is done", async () => {
    let fail!: (error: Error) => void;
    const pending = prefetchPages([
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    ]);

    expect(recoverFromStaleChunk(preloadError(), 1_000_000)).toBe(false);
    fail(new Error("gone"));
    await pending;

    expect(reload).not.toHaveBeenCalled();
    expect(recoverFromStaleChunk(preloadError(), 1_000_000)).toBe(true);
  });
});
