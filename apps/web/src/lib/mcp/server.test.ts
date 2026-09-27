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
const close = vi.fn(async () => undefined);
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
const transports: { fetch: Fetch }[] = [];
vi.mock("@modelcontextprotocol/client", async (actual) => ({
  ...(await actual<typeof import("@modelcontextprotocol/client")>()),
  Client: class {
    connect = connect;
    readResource = readResource;
    close = close;
    listTools = async () => ({ tools: [] });
    listResources = async () => ({
      resources: [
        { uri: "ui://graspy/lesson", name: "lesson", title: "Lesson" },
      ],
    });
  },
  StreamableHTTPClientTransport: class {
    constructor(_url: URL, options: { fetch: Fetch }) {
      transports.push(options);
    }
  },
}));
const { fetchWithSession } = vi.hoisted(() => ({
  fetchWithSession: vi.fn(
    async (_url: string, _init?: RequestInit, _still?: () => boolean) =>
      new Response(),
  ),
}));
vi.mock("@/lib/api/session", () => ({ fetchWithSession }));
const ADA = "ada";
const GRACE = "grace";
let learner: string | null = ADA;
vi.mock("@/lib/account/account-store", () => ({
  currentAccount: () => (learner ? { uid: "uid-1", learner } : null),
  learnerKeyOf: ({ uid, learner }: { uid: string; learner: string }) =>
    `${uid}/${learner}`,
}));

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

/** Read and shown: the view bridge keeps the page once the view has initialized. */
async function shownOnline() {
  connect.mockResolvedValue(undefined);
  const { uiView, keepView } = await fresh();
  const view = await uiView("ui://graspy/lesson");
  keepView("ui://graspy/lesson", view);
  return view;
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
  learner = ADA;
  transports.length = 0;
  close.mockClear();
  fetchWithSession.mockClear();
  connect.mockReset();
  readResource.mockReset();
  readResource.mockResolvedValue(LESSON_VIEW);
});

describe("a view", () => {
  it("opens from the copy kept when it was last shown, without a connection", async () => {
    const read = await shownOnline();

    connect.mockRejectedValue(new TypeError("Failed to fetch"));
    const offline = await (await fresh()).uiView("ui://graspy/lesson");

    expect(read).toMatchObject({
      html: "<html>lesson</html>",
      title: "Lesson",
    });
    expect(offline).toEqual(read);
  });

  it("opens from the copy kept while the device is offline, whatever the failure", async () => {
    const read = await shownOnline();

    online = false;
    connect.mockRejectedValue(new Error("Network request failed"));
    const offline = await (await fresh()).uiView("ui://graspy/lesson");

    expect(offline).toEqual(read);
  });

  it("opens from the copy kept when nothing answers the read before it times out", async () => {
    const read = await shownOnline();

    readResource.mockRejectedValue(
      new SdkError(SdkErrorCode.RequestTimeout, "Request timed out", {
        timeout: 60_000,
      }),
    );
    const timedOut = await (await fresh()).uiView("ui://graspy/lesson");

    expect(timedOut).toEqual(read);
  });

  it("read but not shown leaves the copy kept as it is", async () => {
    await shownOnline();
    readResource.mockResolvedValue({
      contents: [{ ...LESSON_VIEW.contents[0], text: "<html>newer</html>" }],
    });
    await expect(
      (await fresh()).uiView("ui://graspy/lesson"),
    ).resolves.toMatchObject({ html: "<html>newer</html>" });

    connect.mockRejectedValue(new TypeError("Failed to fetch"));
    const offline = await (await fresh()).uiView("ui://graspy/lesson");

    expect(offline.html).toBe("<html>lesson</html>");
  });

  it("never read cannot open without a connection", async () => {
    connect.mockRejectedValue(new TypeError("Failed to fetch"));
    const { uiView } = await fresh();

    await expect(uiView("ui://graspy/lesson")).rejects.toThrow();
  });

  it("refused by the server does not open from the copy kept", async () => {
    await shownOnline();

    const refusal = new Error("Resource ui://graspy/lesson not found");
    readResource.mockRejectedValue(refusal);
    const { uiView } = await fresh();

    await expect(uiView("ui://graspy/lesson")).rejects.toBe(refusal);
  });

  it("does not open from the copy kept when the server answers with an error", async () => {
    await shownOnline();

    const failure = new Error("Error POSTing to endpoint (HTTP 500)");
    connect.mockRejectedValue(failure);
    const { uiView } = await fresh();

    await expect(uiView("ui://graspy/lesson")).rejects.toBe(failure);
  });
});

describe("the background read of every view", () => {
  const newerView = (text: string) => ({
    contents: [{ ...LESSON_VIEW.contents[0], text }],
  });

  it("keeps a view that has no copy, so it opens without a connection", async () => {
    connect.mockResolvedValue(undefined);
    await (await fresh()).readAllViews();

    connect.mockRejectedValue(new TypeError("Failed to fetch"));
    const offline = await (await fresh()).uiView("ui://graspy/lesson");

    expect(offline.html).toBe("<html>lesson</html>");
  });

  it("leaves a kept copy as it is: its files were cached by showing it, a newer page's may not be", async () => {
    await shownOnline();
    readResource.mockResolvedValue(newerView("<html>newer</html>"));
    await (await fresh()).readAllViews();

    connect.mockRejectedValue(new TypeError("Failed to fetch"));
    const offline = await (await fresh()).uiView("ui://graspy/lesson");

    expect(offline.html).toBe("<html>lesson</html>");
  });

  it("is overtaken by a view being shown, which replaces its copy", async () => {
    await shownOnline();
    readResource.mockResolvedValue(newerView("<html>newer</html>"));
    await shownOnline();

    connect.mockRejectedValue(new TypeError("Failed to fetch"));
    const offline = await (await fresh()).uiView("ui://graspy/lesson");

    expect(offline.html).toBe("<html>newer</html>");
  });
});

describe("the connection to the server", () => {
  beforeEach(() => connect.mockResolvedValue(undefined));

  it("is one per learner, made again once the device learns as someone else", async () => {
    const { reachServer } = await fresh();

    await reachServer();
    await reachServer();
    expect(connect).toHaveBeenCalledTimes(1);

    learner = GRACE;
    await reachServer();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("is one for a device learning signed out, whose id may be new on each read", async () => {
    learner = null;
    const { reachServer } = await fresh();

    await reachServer();
    await reachServer();

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("closes the last learner's connection once the next learner's is made", async () => {
    const { reachServer } = await fresh();
    await reachServer();

    learner = GRACE;
    await reachServer();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("sends each request only while the device learns as the learner it was made for", async () => {
    const { reachServer } = await fresh();
    await reachServer();
    const [{ fetch }] = transports;

    await fetch("https://api/mcp", { method: "POST" });
    const [url, init, still] = fetchWithSession.mock.calls[0];

    expect([url, init]).toEqual(["https://api/mcp", { method: "POST" }]);
    expect(still?.()).toBe(true);
    learner = GRACE;
    expect(still?.()).toBe(false);
  });

  it("is not made for work pinned to a learner the device has left", async () => {
    const { pinLearner, reachServer, callAppTool } = await fresh();
    const { LearnerChanged } = await import("@/lib/learner-pin");
    const pin = pinLearner();
    await reachServer(pin);

    learner = GRACE;

    await expect(reachServer(pin)).rejects.toBeInstanceOf(LearnerChanged);
    await expect(callAppTool("answer_check", {}, pin)).rejects.toBeInstanceOf(
      LearnerChanged,
    );
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
