import { existsSync, readFileSync } from "node:fs";

/** The Bedrock key the child and the judge speak through: the environment first, then the server's .dev.vars. */
export function bedrockKey(devVars = new URL("../../server/.dev.vars", import.meta.url)): string {
  const fromEnv = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (fromEnv) return fromEnv;
  if (existsSync(devVars)) {
    const line = readFileSync(devVars, "utf8").split("\n").find((row) => row.startsWith("AWS_BEARER_TOKEN_BEDROCK="));
    if (line) return line.slice(line.indexOf("=") + 1).trim();
  }
  throw new Error("Set AWS_BEARER_TOKEN_BEDROCK, or put it in apps/server/.dev.vars");
}
