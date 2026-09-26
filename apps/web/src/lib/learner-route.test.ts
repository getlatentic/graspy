import { beforeEach, describe, expect, it, vi } from "vitest";
import { askRoute, keepRoute, keptRoute } from "./learner-route";

const { callAppTool } = vi.hoisted(() => ({ callAppTool: vi.fn() }));
vi.mock("@/lib/mcp/server", () => ({ callAppTool }));

const stored = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
  },
});

const answers = (voiceOnly: boolean) => ({
  content: [],
  structuredContent: { voiceOnly },
});

let n = 0;
// Each test its own class: the server is asked once a visit per class.
const aClass = () => ({
  system: "NG",
  level: `nursery-${(n += 1)}`,
  gradeLevel: "Nursery",
});

beforeEach(() => {
  stored.clear();
  callAppTool.mockReset();
});

describe("askRoute", () => {
  it("asks the server through MCP, with the class the plan names, and keeps its answer", async () => {
    const details = aClass();
    callAppTool.mockResolvedValue(answers(true));

    await expect(askRoute(details)).resolves.toBe(true);
    expect(callAppTool).toHaveBeenCalledWith("learner_route", details);
    expect(keptRoute(details)).toBe(true);
  });

  it("follows the server over an answer kept before", async () => {
    const details = aClass();
    keepRoute(details, true);
    callAppTool.mockResolvedValue(answers(false));

    await expect(askRoute(details)).resolves.toBe(false);
    expect(keptRoute(details)).toBe(false);
  });

  it("without a connection, gives the answer kept for the class", async () => {
    const details = aClass();
    keepRoute(details, true);
    callAppTool.mockRejectedValue(new TypeError("Failed to fetch"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(askRoute(details)).resolves.toBe(true);
  });

  it("has no answer before the server or an earlier visit gave one", async () => {
    const details = aClass();
    callAppTool.mockResolvedValue({ content: [], isError: true });

    await expect(askRoute(details)).resolves.toBeNull();
    expect(keptRoute(details)).toBeNull();
  });

  it("asks once a visit for a class the server has answered", async () => {
    const details = aClass();
    callAppTool.mockResolvedValue(answers(false));

    await askRoute(details);
    await askRoute(details);

    expect(callAppTool).toHaveBeenCalledTimes(1);
  });

  it("keeps a class's answer apart from another's", () => {
    const nursery = aClass();
    const primary = { ...aClass(), level: "primary-1" };
    keepRoute(nursery, true);

    expect(keptRoute(primary)).toBeNull();
  });
});
