import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, toNetworkError } from "@/lib/api/errors";
import { isUnreachable } from "./unreachable";

let online = true;

beforeEach(() => {
  online = true;
  vi.stubGlobal("navigator", {
    get onLine() {
      return online;
    },
  });
});

describe("a failure while the device is online", () => {
  it.each([
    ["a fetch that rejected", new TypeError("Failed to fetch")],
    ["a session exchange that reached no one", new NetworkError("offline")],
    [
      "a request whose fetch rejected",
      toNetworkError(new TypeError("Failed to fetch")),
    ],
  ])("is unreachable for %s", (_, error) => {
    expect(isUnreachable(error)).toBe(true);
  });

  it.each([
    ["a refused session", new ApiError("refused", 403)],
    [
      "an empty session",
      new ApiError("The server issued an empty session", 200),
    ],
    [
      "a refused session relayed by a request",
      toNetworkError(new ApiError("refused", 403)),
    ],
    ["a refusal from the MCP server", new Error("Resource not found")],
  ])("is an answer for %s", (_, error) => {
    expect(isUnreachable(error)).toBe(false);
  });
});

it("is unreachable for any failure while the device is offline", () => {
  online = false;

  expect(isUnreachable(new ApiError("refused", 403))).toBe(true);
});
