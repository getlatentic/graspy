import { beforeEach, expect, it, vi } from "vitest";

const createSSEStream = vi.fn();
vi.mock("@/lib/api/sse", () => ({ createSSEStream }));

const { streamCurriculum } = await import("./curriculum-api");

beforeEach(() => {
  createSSEStream.mockReset();
});

it("asks the plan stream for an idle limit, so a hang reaches the error with its retry", () => {
  streamCurriculum({ country: "NG", language: "en", subjects: ["Maths"] });

  const [url, options] = createSSEStream.mock.calls[0];
  expect(url).toContain("/curriculum/generate-stream");
  expect(options.idleMs).toBeGreaterThanOrEqual(40_000);
});
