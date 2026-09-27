import { SdkError, SdkErrorCode } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SANDBOX = "/ui-sandbox/0123456789abcdef/";
const NEXT_SANDBOX = "/ui-sandbox/fedcba9876543210/";
const pageOf = (text: string, sandbox = SANDBOX) => ({
  contents: [
    {
      uri: "ui://graspy/lesson",
      mimeType: "text/html;profile=mcp-app",
      text,
      _meta: { "graspy/sandbox": sandbox },
    },
  ],
});
const LESSON_VIEW = pageOf("<html>lesson</html>");

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
const { keepSandbox } = vi.hoisted(() => ({
  keepSandbox: vi.fn(async (_sandbox: string, _needed: Set<string>) => true),
}));
vi.mock("./sandbox", () => ({ keepSandbox }));
const ADA = "ada";
const GRACE = "grace";
let learner: string | null = ADA;
let turn = 0;
/** The device learns as someone else, as a switch or a sign-out makes it. */
function learnAs(next: string | null): void {
  learner = next;
  turn += 1;
}
vi.mock("@/lib/account/account-store", async (original) => ({
  ...(await original<typeof import("@/lib/account/account-store")>()),
  currentAccount: () =>
    learner ? { uid: "uid-1", learner: { id: learner, name: learner } } : null,
  learnerTurn: () => turn,
}));

let online = true;

let store = new Map<string, string>();

function stubStorage() {
  store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

async function fresh() {
  vi.resetModules();
  return import("./server");
}

/** Kept while online, its sandbox's worker holding its build's files. */
async function keptOnline() {
  connect.mockResolvedValue(undefined);
  const { uiView, readAllViews } = await fresh();
  await readAllViews();
  return uiView("ui://graspy/lesson");
}

async function openedOffline() {
  connect.mockRejectedValue(new TypeError("Failed to fetch"));
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
  learner = ADA;
  transports.length = 0;
  close.mockClear();
  fetchWithSession.mockClear();
  connect.mockReset();
  readResource.mockReset();
  readResource.mockResolvedValue(LESSON_VIEW);
  keepSandbox.mockReset();
  keepSandbox.mockResolvedValue(true);
});

describe("a view", () => {
  it("opens from the copy kept when it was last shown, without a connection", async () => {
    const read = await keptOnline();

    connect.mockRejectedValue(new TypeError("Failed to fetch"));
    const offline = await (await fresh()).uiView("ui://graspy/lesson");

    expect(read).toMatchObject({
      html: "<html>lesson</html>",
      title: "Lesson",
    });
    expect(offline).toEqual(read);
  });

  it("opens from the copy kept while the device is offline, whatever the failure", async () => {
    const read = await keptOnline();

    online = false;
    connect.mockRejectedValue(new Error("Network request failed"));
    const offline = await (await fresh()).uiView("ui://graspy/lesson");

    expect(offline).toEqual(read);
  });

  it("opens from the copy kept when nothing answers the read before it times out", async () => {
    const read = await keptOnline();

    readResource.mockRejectedValue(
      new SdkError(SdkErrorCode.RequestTimeout, "Request timed out", {
        timeout: 60_000,
      }),
    );
    const timedOut = await (await fresh()).uiView("ui://graspy/lesson");

    expect(timedOut).toEqual(read);
  });

  it("read but not kept leaves the copy kept as it is", async () => {
    await keptOnline();
    readResource.mockResolvedValue(pageOf("<html>newer</html>"));
    await expect(
      (await fresh()).uiView("ui://graspy/lesson"),
    ).resolves.toMatchObject({ html: "<html>newer</html>" });

    expect((await openedOffline()).html).toBe("<html>lesson</html>");
  });

  it("opens in the sandbox its resource names", async () => {
    connect.mockResolvedValue(undefined);

    await expect(
      (await fresh()).uiView("ui://graspy/lesson"),
    ).resolves.toMatchObject({ sandbox: SANDBOX });
  });

  it("is refused when its resource names no sandbox", async () => {
    connect.mockResolvedValue(undefined);
    const { _meta: _, ...unnamed } = LESSON_VIEW.contents[0];
    readResource.mockResolvedValue({ contents: [unnamed] });

    await expect((await fresh()).uiView("ui://graspy/lesson")).rejects.toThrow(
      "names no sandbox",
    );
  });

  it("kept before pages named their sandbox does not open without a connection", async () => {
    store.set(
      "graspy.view.ui://graspy/lesson",
      JSON.stringify({ html: "<html>lesson</html>", title: "Lesson" }),
    );

    await expect(openedOffline()).rejects.toThrow();
  });

  it("never read cannot open without a connection", async () => {
    connect.mockRejectedValue(new TypeError("Failed to fetch"));
    const { uiView } = await fresh();

    await expect(uiView("ui://graspy/lesson")).rejects.toThrow();
  });

  it("refused by the server does not open from the copy kept", async () => {
    await keptOnline();

    const refusal = new Error("Resource ui://graspy/lesson not found");
    readResource.mockRejectedValue(refusal);
    const { uiView } = await fresh();

    await expect(uiView("ui://graspy/lesson")).rejects.toBe(refusal);
  });

  it("does not open from the copy kept when the server answers with an error", async () => {
    await keptOnline();

    const failure = new Error("Error POSTing to endpoint (HTTP 500)");
    connect.mockRejectedValue(failure);
    const { uiView } = await fresh();

    await expect(uiView("ui://graspy/lesson")).rejects.toBe(failure);
  });
});

describe("the background keep of every view", () => {
  it("keeps a view never shown once its sandbox's worker holds its files", async () => {
    connect.mockResolvedValue(undefined);
    await (await fresh()).readAllViews();

    expect(keepSandbox).toHaveBeenCalledWith(SANDBOX, new Set([SANDBOX]));
    expect((await openedOffline()).html).toBe("<html>lesson</html>");
  });

  it("keeps nothing while the worker does not hold every file", async () => {
    keepSandbox.mockResolvedValue(false);
    connect.mockResolvedValue(undefined);
    await (await fresh()).readAllViews();

    await expect(openedOffline()).rejects.toThrow();
  });

  it("replaces a copy from an earlier build once the new build's files are held", async () => {
    await keptOnline();
    readResource.mockResolvedValue(
      pageOf("<html>deployed</html>", NEXT_SANDBOX),
    );
    await (await fresh()).readAllViews();

    expect(keepSandbox).toHaveBeenLastCalledWith(
      NEXT_SANDBOX,
      new Set([SANDBOX, NEXT_SANDBOX]),
    );
    expect(await openedOffline()).toMatchObject({
      html: "<html>deployed</html>",
      sandbox: NEXT_SANDBOX,
    });
  });

  it("leaves a copy from an earlier build, and its sandbox, while the new build's files are not held", async () => {
    await keptOnline();
    readResource.mockResolvedValue(
      pageOf("<html>deployed</html>", NEXT_SANDBOX),
    );
    keepSandbox.mockResolvedValue(false);
    await (await fresh()).readAllViews();
    await (await fresh()).readAllViews();

    expect(keepSandbox).toHaveBeenLastCalledWith(
      NEXT_SANDBOX,
      new Set([SANDBOX, NEXT_SANDBOX]),
    );
    expect(await openedOffline()).toMatchObject({
      html: "<html>lesson</html>",
      sandbox: SANDBOX,
    });
  });

  it("lets an earlier build's sandbox go once no copy opens in it", async () => {
    await keptOnline();
    readResource.mockResolvedValue(
      pageOf("<html>deployed</html>", NEXT_SANDBOX),
    );
    await (await fresh()).readAllViews();
    await (await fresh()).readAllViews();

    expect(keepSandbox).toHaveBeenLastCalledWith(
      NEXT_SANDBOX,
      new Set([NEXT_SANDBOX]),
    );
  });

  it("runs once at a time however often it is asked", async () => {
    connect.mockResolvedValue(undefined);
    const { readAllViews } = await fresh();

    await Promise.all([readAllViews(), readAllViews()]);

    expect(keepSandbox).toHaveBeenCalledTimes(1);
  });
});

describe("the connection to the server", () => {
  beforeEach(() => connect.mockResolvedValue(undefined));

  it("is one per learner, made again once the device learns as someone else", async () => {
    const { reachServer } = await fresh();

    await reachServer();
    await reachServer();
    expect(connect).toHaveBeenCalledTimes(1);

    learnAs(GRACE);
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

  it("is made again for a learner the device comes back to, whose last turn has ended", async () => {
    const { reachServer } = await fresh();
    await reachServer();

    learnAs(GRACE);
    learnAs(ADA);
    await reachServer();

    expect(connect).toHaveBeenCalledTimes(2);
    const [, { fetch }] = transports;
    await expect(fetch("https://api/mcp")).resolves.toBeInstanceOf(Response);
  });

  it("closes the last learner's connection once the next learner's is made", async () => {
    const { reachServer } = await fresh();
    await reachServer();

    learnAs(GRACE);
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
    learnAs(GRACE);
    expect(still?.()).toBe(false);
  });

  it("is not made for work pinned to a learner the device has left", async () => {
    const { reachServer, callAppTool } = await fresh();
    const { LearnerChanged, pinLearner } = await import("@/lib/learner-pin");
    const pin = pinLearner();
    await reachServer(pin);

    learnAs(GRACE);

    await expect(reachServer(pin)).rejects.toBeInstanceOf(LearnerChanged);
    await expect(callAppTool("answer_check", {}, pin)).rejects.toBeInstanceOf(
      LearnerChanged,
    );
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
