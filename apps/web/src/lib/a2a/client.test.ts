import { beforeEach, describe, expect, it, vi } from "vitest";

// The tutor reached through the real A2A SDK, with its card and RPC endpoint scripted.
vi.mock("@/lib/env", () => ({ A2A_BASE_URL: "https://api.test/a2a" }));
vi.mock("@/lib/api/session", () => ({
  getSessionToken: async () => "session-token",
  refreshSessionToken: async () => "session-token",
}));

const CARD = {
  name: "graspy tutor",
  description: "",
  version: "1",
  supportedInterfaces: [
    {
      url: "https://api.test/a2a",
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    },
  ],
  capabilities: { streaming: true },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [],
};

let rpc: () => Promise<Response>;
let rpcCalls = 0;

async function tutorFetch(input: RequestInfo | URL): Promise<Response> {
  if (String(input).endsWith("/.well-known/agent-card.json")) {
    return Response.json(CARD);
  }
  rpcCalls += 1;
  return rpc();
}

async function asked() {
  vi.resetModules();
  const [{ askAgent }, errors] = await Promise.all([
    import("./client"),
    import("@/lib/api/errors"),
  ]);
  const failure = await askAgent({ text: "What is 7 x 8?" }).catch(
    (error: unknown) => error,
  );
  return { failure, ...errors };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"], shouldAdvanceTime: true });
  vi.stubGlobal("fetch", tutorFetch);
  rpcCalls = 0;
});

describe("a tutor turn that fails", () => {
  it("keeps the status of the tutor's HTTP answer and is not tried again", async () => {
    rpc = async () =>
      Response.json({ detail: { error: "No learner" } }, { status: 409 });

    const { failure, ApiError, NetworkError } = await asked();

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).not.toBeInstanceOf(NetworkError);
    expect((failure as { status: number }).status).toBe(409);
    expect(rpcCalls).toBe(1);
  });

  it("tries once more when the tutor was busy", async () => {
    rpc = async () => new Response("Service Unavailable", { status: 503 });

    const { failure } = await asked();

    expect((failure as { status: number }).status).toBe(503);
    expect(rpcCalls).toBe(2);
  });

  // The SDK numbers its requests from 1, and each turn here is a fresh client.
  const rpcError = (code: number) => ({
    jsonrpc: "2.0",
    id: 1,
    error: { code, message: `JSON-RPC ${code}` },
  });

  it.each([
    [-32603, "internal error"],
    [-32050, "server error"],
    [-32006, "invalid agent response"],
  ])(
    "is the tutor failing, tried once more, on JSON-RPC %i (%s)",
    async (code) => {
      rpc = async () => Response.json(rpcError(code));

      const { failure, ApiError, NetworkError, UNREADABLE_ANSWER } =
        await asked();

      expect(failure).toBeInstanceOf(ApiError);
      expect(failure).not.toBeInstanceOf(NetworkError);
      expect((failure as { status: number }).status).toBe(UNREADABLE_ANSWER);
      expect(rpcCalls).toBe(2);
    },
  );

  it.each([
    [-32600, 400, "invalid request"],
    [-32601, 404, "method not found"],
    [-32602, 400, "invalid params"],
    [-32001, 404, "task not found"],
  ])(
    "is a refusal of the request, not tried again, on JSON-RPC %i",
    async (code, status) => {
      rpc = async () => Response.json(rpcError(code));

      const { failure } = await asked();

      expect(failure).toMatchObject({ status });
      expect((failure as { retryable: boolean }).retryable).toBe(false);
      expect(rpcCalls).toBe(1);
    },
  );

  it.each([
    [-32001, 404, 1],
    [-32050, 502, 2],
  ])(
    "classifies JSON-RPC %i inside the stream as %i",
    async (code, status, calls) => {
      rpc = async () =>
        new Response(`data: ${JSON.stringify(rpcError(code))}\n\n`, {
          headers: { "Content-Type": "text/event-stream" },
        });

      const { failure } = await asked();

      expect(failure).toMatchObject({ status });
      expect(rpcCalls).toBe(calls);
    },
  );

  it("is the tutor failing, tried once more, when its stream ends with no answer", async () => {
    rpc = async () =>
      new Response("", { headers: { "Content-Type": "text/event-stream" } });

    const { failure, ApiError, NetworkError, UNREADABLE_ANSWER } =
      await asked();

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).not.toBeInstanceOf(NetworkError);
    expect(failure).toMatchObject({
      message: "The tutor stopped before answering",
      status: UNREADABLE_ANSWER,
    });
    expect(rpcCalls).toBe(2);
  });

  it("is a NetworkError, tried once more, when nothing reached the tutor", async () => {
    rpc = async () => {
      throw new TypeError("Failed to fetch");
    };

    const { failure, NetworkError } = await asked();

    expect(failure).toBeInstanceOf(NetworkError);
    expect(rpcCalls).toBe(2);
  });
});
