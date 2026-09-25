import { describe, expect, it } from "vitest";
import { timeAgo } from "@/lib/time-ago";

const NOW = Date.UTC(2026, 8, 23, 12);
const MINUTE = 60_000;

describe("timeAgo", () => {
  it.each([
    [10_000, "now"],
    [5 * MINUTE, "5 minutes ago"],
    [2 * 60 * MINUTE, "2 hours ago"],
    [26 * 60 * MINUTE, "yesterday"],
    [3 * 24 * 60 * MINUTE, "3 days ago"],
    [15 * 24 * 60 * MINUTE, "2 weeks ago"],
  ])("reads %i ms as %s", (elapsed, text) => {
    expect(timeAgo(NOW - elapsed, "en", NOW)).toBe(text);
  });
});
