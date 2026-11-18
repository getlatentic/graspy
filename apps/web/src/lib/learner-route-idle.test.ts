import { beforeEach, describe, expect, it, vi } from "vitest";
import { keepRoute } from "./learner-route";
import { followRoute } from "./learner-route-follow";

const { callAppTool, idle } = vi.hoisted(() => ({
  callAppTool: vi.fn(),
  idle: { release: () => undefined as void },
}));
vi.mock("@/lib/mcp/server", () => ({ callAppTool }));
vi.mock("@/lib/when-idle", () => ({
  whenIdle: () =>
    new Promise<void>((resolve) => {
      idle.release = resolve;
    }),
}));

const stored = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
  },
});

const noWait = async () => undefined;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  stored.clear();
  callAppTool.mockReset().mockResolvedValue({
    content: [],
    structuredContent: { voiceOnly: true },
  });
});

describe("followRoute with an answer kept", () => {
  it("asks the server only once the page is idle", async () => {
    const details = { system: "NG", level: "nursery-idle-1" };
    keepRoute(details, true);
    const stop = followRoute(details, noWait);
    await flush();
    expect(callAppTool).not.toHaveBeenCalled();
    idle.release();
    await flush();
    expect(callAppTool).toHaveBeenCalledTimes(1);
    stop();
  });

  it("asks at once for a class with no answer kept", async () => {
    const details = { system: "NG", level: "nursery-idle-2" };
    const stop = followRoute(details, noWait);
    await flush();
    expect(callAppTool).toHaveBeenCalledTimes(1);
    stop();
  });
});
