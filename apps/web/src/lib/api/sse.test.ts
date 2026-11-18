import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";

const fetchWithSession = vi.hoisted(() => vi.fn());
vi.mock("./session", () => ({ fetchWithSession }));

import { createSSEStream } from "./sse";
import { ApiError, NetworkError, UNREADABLE_ANSWER } from "./errors";

function bodyOf(slices: Uint8Array[]) {
  let i = 0;
  const reader = {
    read: async () =>
      i < slices.length
        ? { done: false, value: slices[i++] }
        : { done: true, value: undefined },
    cancel: vi.fn(async () => {}),
  };
  return { reader, body: { getReader: () => reader } };
}

function respond(slices: Uint8Array[], status = 200) {
  const { reader, body } = bodyOf(slices);
  fetchWithSession.mockResolvedValue({
    ok: status < 400,
    status,
    body,
    json: async () => ({ error: "boom" }),
  });
  return reader;
}

const enc = new TextEncoder();
const wire = (events: string[]) => events.map((e) => `data: ${e}\n\n`).join("");

async function collect<T>(url = "/stream"): Promise<T[]> {
  const out: T[] = [];
  for await (const item of createSSEStream<T>(url)) out.push(item);
  return out;
}

beforeEach(() => {
  fetchWithSession.mockReset();
});

it("yields each event as parsed JSON", async () => {
  respond([enc.encode(wire(['{"n":1}', '{"n":2}']))]);

  await expect(collect()).resolves.toEqual([{ n: 1 }, { n: 2 }]);
});

it("stops at the [DONE] sentinel and ignores anything after it", async () => {
  respond([enc.encode(`data: {"n":1}\n\ndata: [DONE]\n\ndata: {"n":2}\n\n`)]);

  await expect(collect()).resolves.toEqual([{ n: 1 }]);
});

it("skips heartbeats rather than trying to parse them", async () => {
  respond([enc.encode(`event: ping\ndata: keepalive\n\ndata: {"n":1}\n\n`)]);
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});

  await expect(collect()).resolves.toEqual([{ n: 1 }]);
  expect(spy).not.toHaveBeenCalled();
});

it("frames CRLF streams", async () => {
  respond([enc.encode(`data: {"n":1}\r\n\r\ndata: {"n":2}\r\n\r\n`)]);

  await expect(collect()).resolves.toEqual([{ n: 1 }, { n: 2 }]);
});

it("raises ApiError for a failed response", async () => {
  respond([], 502);

  await expect(collect()).rejects.toBeInstanceOf(ApiError);
});

it("cancels the body when the consumer stops early", async () => {
  const reader = respond([enc.encode(wire(['{"n":1}', '{"n":2}']))]);

  for await (const _ of createSSEStream("/stream")) break;

  expect(reader.cancel).toHaveBeenCalled();
});

it("takes an OK answer with no stream as an answer a later try may read", async () => {
  fetchWithSession.mockResolvedValue({ ok: true, status: 200, body: null });

  const failure = await collect().catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(ApiError);
  expect(failure).not.toBeInstanceOf(NetworkError);
  expect((failure as ApiError).status).toBe(UNREADABLE_ANSWER);
  expect((failure as ApiError).retryable).toBe(true);
});

it("reassembles events split at any byte boundary", async () => {
  const payload = wire(['{"n":1}', '{"subject":"Mathématiques"}', '{"n":3}']);
  const bytes = enc.encode(payload);

  await fc.assert(
    fc.asyncProperty(
      // Includes mid-separator and mid-UTF-8 cuts.
      fc.uniqueArray(fc.integer({ min: 1, max: bytes.length - 1 }), {
        maxLength: 6,
      }),
      async (cuts) => {
        const points = [0, ...[...cuts].sort((a, b) => a - b), bytes.length];
        const slices = points
          .slice(1)
          .map((end, i) => bytes.slice(points[i], end))
          .filter((s) => s.length > 0);

        respond(slices);

        await expect(collect()).resolves.toEqual([
          { n: 1 },
          { subject: "Mathématiques" },
          { n: 3 },
        ]);
      },
    ),
    { numRuns: 60 },
  );
});

describe("an idle limit", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const silentStream = () => {
    const reader = {
      read: () => new Promise<never>(() => {}),
      cancel: vi.fn(async () => {}),
    };
    fetchWithSession.mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    });
    return reader;
  };

  it("ends a stream that goes quiet with an error a later try may pass, and lets go of the body", async () => {
    vi.useFakeTimers();
    const reader = silentStream();

    const failure = (async () => {
      for await (const _ of createSSEStream("/stream", { idleMs: 5_000 })) {
        // nothing arrives
      }
    })().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5_000);

    const error = (await failure) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(504);
    expect(error.retryable).toBe(true);
    expect(reader.cancel).toHaveBeenCalled();
  });

  it("stays the 504 when letting go of the aborted body fails", async () => {
    vi.useFakeTimers();
    const reader = silentStream();
    reader.cancel.mockRejectedValue(new DOMException("aborted", "AbortError"));

    const failure = collectWith({ idleMs: 5_000 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(((await failure) as ApiError).status).toBe(504);
  });

  it("does not fire while the page is in the background, and does once it is back", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("document", { hidden: true });
    silentStream();
    let failed: unknown = null;
    void collectWith({ idleMs: 5_000 }).catch((e: unknown) => (failed = e));

    await vi.advanceTimersByTimeAsync(20_000);
    expect(failed).toBeNull();

    vi.stubGlobal("document", { hidden: false });
    await vi.advanceTimersByTimeAsync(5_000);
    expect((failed as ApiError).status).toBe(504);
  });

  it("is kept from firing by heartbeats, which are bytes like any other", async () => {
    vi.useFakeTimers();
    const queue: Array<() => void> = [];
    const chunks = [
      enc.encode("event: ping\ndata: keepalive\n\n"),
      enc.encode("event: ping\ndata: keepalive\n\n"),
      enc.encode('data: {"n":1}\n\ndata: [DONE]\n\n'),
    ];
    let i = 0;
    const reader = {
      // Each chunk comes 4 s after the last: 12 s in all, over the 5 s limit.
      read: () =>
        new Promise((resolve) => {
          queue.push(() => resolve({ done: false, value: chunks[i++] }));
          setTimeout(() => queue.shift()?.(), 4_000);
        }),
      cancel: vi.fn(async () => {}),
    };
    fetchWithSession.mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    });

    const out: unknown[] = [];
    const done = (async () => {
      for await (const item of createSSEStream("/stream", { idleMs: 5_000 })) {
        out.push(item);
      }
    })();
    await vi.advanceTimersByTimeAsync(12_000);
    await done;

    expect(out).toEqual([{ n: 1 }]);
  });

  it("gives up on an answer that never starts", async () => {
    vi.useFakeTimers();
    fetchWithSession.mockReturnValue(new Promise(() => {}));

    const failure = collectWith({ idleMs: 5_000 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(((await failure) as ApiError).retryable).toBe(true);
  });

  it("is not there unless asked for: a quiet stream is waited on", async () => {
    vi.useFakeTimers();
    silentStream();
    let settled = false;
    void collect().then(
      () => (settled = true),
      () => (settled = true),
    );

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(settled).toBe(false);
  });
});

async function collectWith(options: { idleMs: number }): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const item of createSSEStream("/stream", options)) out.push(item);
  return out;
}
