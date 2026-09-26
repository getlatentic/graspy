import { SdkError, SdkErrorCode } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LESSON_VIEW = {
  contents: [
    {
      uri: "ui://graspy/lesson",
      mimeType: "text/html;profile=mcp-app",
      text: "<html>lesson</html>",
    },
  ],
};

const connect = vi.fn();
const readResource = vi.fn();
vi.mock("@modelcontextprotocol/client", async (actual) => ({
  ...(await actual<typeof import("@modelcontextprotocol/client")>()),
  Client: class {
    connect = connect;
    readResource = readResource;
    listTools = async () => ({ tools: [] });
    listResources = async () => ({
      resources: [
        { uri: "ui://graspy/lesson", name: "lesson", title: "Lesson" },
      ],
    });
  },
  StreamableHTTPClientTransport: class {},
}));
vi.mock("@/lib/api/session", () => ({ fetchWithSession: vi.fn() }));

let online = true;

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

async function readOnline() {
  connect.mockResolvedValue(undefined);
  return (await fresh()).uiView("ui://graspy/lesson");
}

beforeEach(() => {
  online = true;
  vi.unstubAllGlobals();
  stubStorage();
  vi.stubGlobal("navigator", {
    get onLine() {
      return online;
    },
  });
  connect.mockReset();
  readResource.mockReset();
  readResource.mockResolvedValue(LESSON_VIEW);
});

describe("a view", () => {
  it("opens from the copy kept when it was last read, without a connection", async () => {
    const read = await readOnline();

    connect.mockRejectedValue(new TypeError("Failed to fetch"));
    const offline = await (await fresh()).uiView("ui://graspy/lesson");

    expect(read).toMatchObject({
      html: "<html>lesson</html>",
      title: "Lesson",
    });
    expect(offline).toEqual(read);
  });

  it("opens from the copy kept while the device is offline, whatever the failure", async () => {
    const read = await readOnline();

    online = false;
    connect.mockRejectedValue(new Error("Network request failed"));
    const offline = await (await fresh()).uiView("ui://graspy/lesson");

    expect(offline).toEqual(read);
  });

  it("opens from the copy kept when nothing answers the read before it times out", async () => {
    const read = await readOnline();

    readResource.mockRejectedValue(
      new SdkError(SdkErrorCode.RequestTimeout, "Request timed out", {
        timeout: 60_000,
      }),
    );
    const timedOut = await (await fresh()).uiView("ui://graspy/lesson");

    expect(timedOut).toEqual(read);
  });

  it("never read cannot open without a connection", async () => {
    connect.mockRejectedValue(new TypeError("Failed to fetch"));
    const { uiView } = await fresh();

    await expect(uiView("ui://graspy/lesson")).rejects.toThrow();
  });

  it("refused by the server does not open from the copy kept", async () => {
    await readOnline();

    const refusal = new Error("Resource ui://graspy/lesson not found");
    readResource.mockRejectedValue(refusal);
    const { uiView } = await fresh();

    await expect(uiView("ui://graspy/lesson")).rejects.toBe(refusal);
  });

  it("does not open from the copy kept when the server answers with an error", async () => {
    await readOnline();

    const failure = new Error("Error POSTing to endpoint (HTTP 500)");
    connect.mockRejectedValue(failure);
    const { uiView } = await fresh();

    await expect(uiView("ui://graspy/lesson")).rejects.toBe(failure);
  });
});
