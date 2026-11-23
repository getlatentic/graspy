import { describe, expect, it } from "vitest";
import { appended, LOG_SIZE, type LogEntry } from "./event-log";
import { buildReport } from "./report";

const entry = (text: string, at = 0): LogEntry => ({ at, text, count: 1 });

describe("buildReport", () => {
  it("lists the facts, then the events oldest first with their counts", () => {
    const report = buildReport(
      [{ name: "Window", value: "1920 x 1080" }],
      [{ name: "fetch", value: "yes" }],
      [{ at: 2500, text: "keyup", count: 3 }, entry("keydown", 1000)],
    );
    expect(report).toBe(
      [
        "graspy TV diagnostics",
        "",
        "Environment",
        "Window: 1920 x 1080",
        "",
        "Features",
        "fetch: yes",
        "",
        "Events (last 2)",
        "1.00s keydown",
        "2.50s keyup x3",
      ].join("\n"),
    );
  });

  it("says when no event has come yet", () => {
    expect(buildReport([], [], [])).toContain("(none yet)");
  });
});

describe("appended", () => {
  it("keeps the newest first and no more than the size", () => {
    let log: LogEntry[] = [];
    for (let i = 0; i < LOG_SIZE + 10; i += 1) {
      log = appended(log, entry(`e${i}`), false);
    }
    expect(log).toHaveLength(LOG_SIZE);
    expect(log[0].text).toBe(`e${LOG_SIZE + 9}`);
  });

  it("folds a repeat of a flood event, and only that", () => {
    const once = appended([], entry("pointermove"), true);
    const twice = appended(once, entry("pointermove"), true);
    expect(twice).toHaveLength(1);
    expect(twice[0].count).toBe(2);
    expect(appended(twice, entry("pointermove"), false)).toHaveLength(2);
  });
});
