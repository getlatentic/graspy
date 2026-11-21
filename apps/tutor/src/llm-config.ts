import { chatCompletionsUrl, bedrockOrigin } from "./bedrock-url";

/**
 * A bad `LLM_BASE_URL` makes every Bedrock call fail, and the callers that ask for the router or the observer
 * take a failed call as "no answer", so without a line in the log the children would just get the plain
 * reader. Each line is written once per isolate, never carries the value, and is read in `wrangler tail`.
 */
let checked = false;
let reportedFailure = false;

function log(level: "warn" | "error", part: string, message: string): void {
  console[level](JSON.stringify({ part, message }));
}

/** Once per isolate: a leftover AWS_REGION is unused, and a bad LLM_BASE_URL is named. */
export function checkLlmConfig(env: Env): void {
  if (checked) return;
  checked = true;
  if (env.AWS_REGION?.trim()) log("warn", "llm-config", "AWS_REGION is set but unused: the Bedrock host and region come from LLM_BASE_URL (https://bedrock-mantle.<region>.api.aws).");
  try {
    bedrockOrigin(env.LLM_BASE_URL);
  } catch (error) {
    log("error", "llm-config", `${(error as Error).message} Bedrock calls will fail until it is fixed.`);
  }
}

/** The URL for a call, or null after one line saying the call cannot be made. */
export function bedrockUrlOrNull(env: Env, model: string, part: string): string | null {
  try {
    return chatCompletionsUrl(env, model);
  } catch (error) {
    if (!reportedFailure) {
      reportedFailure = true;
      log("error", part, `${(error as Error).message} This and every later Bedrock call in this isolate is skipped.`);
    }
    return null;
  }
}

/** For tests: forget what has been written. */
export function forgetReports(): void {
  checked = false;
  reportedFailure = false;
}
