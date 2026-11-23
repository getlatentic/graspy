import type { LogEntry } from "./event-log";
import type { Fact } from "./snapshot";

const lines = (facts: readonly Fact[]) =>
  facts.map((f) => `${f.name}: ${f.value}`);

/** The report as plain text, to paste into a message: environment, features, then the log oldest first. */
export function buildReport(
  environment: readonly Fact[],
  features: readonly Fact[],
  log: readonly LogEntry[],
): string {
  const events = [...log]
    .reverse()
    .map(
      (e) =>
        `${(e.at / 1000).toFixed(2)}s ${e.text}${e.count > 1 ? ` x${e.count}` : ""}`,
    );
  return [
    "graspy TV diagnostics",
    "",
    "Environment",
    ...lines(environment),
    "",
    "Features",
    ...lines(features),
    "",
    `Events (last ${log.length})`,
    ...(events.length ? events : ["(none yet)"]),
  ].join("\n");
}
