import { beforeEach, describe, expect, it, vi } from "vitest";

const connect = vi.fn();
vi.mock("@modelcontextprotocol/client", () => ({
  Client: class {
    connect = connect;
    listTools = async () => ({ tools: [] });
    listResources = async () => ({
      resources: [
        { uri: "ui://graspy/lesson", name: "lesson", title: "Lesson" },
      ],
    });
    readResource = async () => ({
      contents: [
        {
          uri: "ui://graspy/lesson",
          mimeType: "text/html;profile=mcp-app",
          text: "<html>lesson</html>",
        },
      ],
    });
  },
  StreamableHTTPClientTransport: class {},
}));
vi.mock("@/lib/api/session", () => ({ fetchWithSession: vi.fn() }));

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
}

async function fresh() {
  vi.resetModules();
  return import("./server");
}

beforeEach(() => {
  vi.unstubAllGlobals();
  stubStorage();
  connect.mockReset();
});

describe("a view", () => {
  it("opens from the copy kept when it was last read, without a connection", async () => {
    connect.mockResolvedValue(undefined);
    const online = await (await fresh()).uiView("ui://graspy/lesson");

    connect.mockRejectedValue(new TypeError("Failed to fetch"));
    const offline = await (await fresh()).uiView("ui://graspy/lesson");

    expect(online).toMatchObject({
      html: "<html>lesson</html>",
      title: "Lesson",
    });
    expect(offline).toEqual(online);
  });

  it("never read cannot open without a connection", async () => {
    connect.mockRejectedValue(new TypeError("Failed to fetch"));
    const { uiView } = await fresh();

    await expect(uiView("ui://graspy/lesson")).rejects.toThrow();
  });
});
