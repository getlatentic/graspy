import { beforeEach, describe, expect, it, vi } from "vitest";
import { keepRoute, keptRoute } from "./learner-route";
import { followRoute } from "./learner-route-follow";

const { callAppTool } = vi.hoisted(() => ({ callAppTool: vi.fn() }));
vi.mock("@/lib/mcp/server", () => ({ callAppTool }));

const stored = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
  },
});

const slides = { content: [], structuredContent: { voiceOnly: false } };
const offline = new TypeError("Failed to fetch");

let n = 0;
// Each test its own class: the server is asked once a visit per class.
const aClass = () => ({ system: "NG", level: `primary-${(n += 1)}` });

// No real waiting: each pause is noted and over at once.
const pauses: number[] = [];
const noWait = async (ms: number) => void pauses.push(ms);

beforeEach(() => {
  stored.clear();
  pauses.length = 0;
  callAppTool.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("followRoute", () => {
  it("asks again, waiting longer each time, until the server answers a class with no answer", async () => {
    const details = aClass();
    callAppTool
      .mockRejectedValueOnce(offline)
      .mockRejectedValueOnce(offline)
      .mockResolvedValue(slides);

    const unfollow = followRoute(details, noWait);

    await vi.waitFor(() => expect(keptRoute(details)).toBe(false));
    expect(callAppTool).toHaveBeenCalledTimes(3);
    expect(pauses).toHaveLength(2);
    expect(pauses[1]).toBeGreaterThan(pauses[0]);
    unfollow();
  });

  it("stops asking once no one follows the class", async () => {
    const details = aClass();
    let resume = () => undefined as void;
    const heldWait = () => new Promise<void>((done) => (resume = done));
    callAppTool.mockRejectedValue(offline);

    const unfollow = followRoute(details, heldWait);
    await vi.waitFor(() => expect(callAppTool).toHaveBeenCalledTimes(1));
    unfollow();
    resume();
    await new Promise((done) => setTimeout(done, 0));

    expect(callAppTool).toHaveBeenCalledTimes(1);
  });

  it("asks once for everyone following the same class", async () => {
    const details = aClass();
    callAppTool.mockResolvedValue(slides);

    const unfollows = [
      followRoute(details, noWait),
      followRoute(details, noWait),
    ];

    await vi.waitFor(() => expect(keptRoute(details)).toBe(false));
    expect(callAppTool).toHaveBeenCalledTimes(1);
    unfollows.forEach((unfollow) => unfollow());
  });

  it("does not wait on the server for a class with an answer kept", async () => {
    const details = aClass();
    keepRoute(details, true);
    callAppTool.mockRejectedValue(offline);

    const unfollow = followRoute(details, noWait);

    await vi.waitFor(() => expect(callAppTool).toHaveBeenCalledTimes(1));
    await new Promise((done) => setTimeout(done, 0));
    expect(pauses).toEqual([]);
    unfollow();
  });
});
