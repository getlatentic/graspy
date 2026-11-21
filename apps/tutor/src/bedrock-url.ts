/**
 * Where Bedrock's OpenAI-compatible endpoint is. `LLM_BASE_URL` is the one setting for the host and its region,
 * and it is an origin only: `https://bedrock-mantle.<region>.api.aws`. The path comes from the model
 * (`bedrockPath`), because this Worker sends Gemma 4 and gpt-oss through the same variable. The key goes to
 * that host, so nothing else is accepted: https, no credentials, port none or 443, no path, query or fragment.
 * The same rule, with paths allowed, is in apps/server/src/app/llm/base_url.py; tests/fixtures/llm-base-urls.json
 * holds the URLs both are tested with.
 */
export const DEFAULT_BASE_URL = "https://bedrock-mantle.us-east-1.api.aws";

const MANTLE_HOST = /^bedrock-mantle\.(?!xn--)[a-z0-9-]+\.api\.aws$/;

/** Bedrock serves Gemma 4 on its /openai/v1 path and the other open models on /v1. */
export function bedrockPath(model: string): string {
  return model.startsWith("google.gemma-4") ? "/openai/v1" : "/v1";
}

/** The chat completions URL for a model. Throws, never naming the value, when `LLM_BASE_URL` is not usable. */
export function chatCompletionsUrl(env: Env, model: string): string {
  return `${bedrockOrigin(env.LLM_BASE_URL)}${bedrockPath(model)}/chat/completions`;
}

/** The validated origin, without a trailing slash; the default when the value is unset or blank. */
export function bedrockOrigin(value: string | undefined): string {
  const raw = value?.trim() || DEFAULT_BASE_URL;
  if (/[\x00-\x20\x7f]/.test(raw)) throw new Error("LLM_BASE_URL must not contain whitespace or control characters.");
  if (/[^\x00-\x7f]/.test(raw)) throw new Error("LLM_BASE_URL must be plain ASCII.");
  if (raw.includes("%")) throw new Error("LLM_BASE_URL must not contain percent escapes.");
  if (raw.includes("\\")) throw new Error("LLM_BASE_URL must not contain backslashes.");
  if (/(^|[/:])\.\.?(\/|$)/.test(raw.replace(/^[a-z]+:\/\//i, ""))) throw new Error("LLM_BASE_URL must not contain dot segments.");
  if (/xn--/i.test(raw)) throw new Error("LLM_BASE_URL host is not valid: it must be bedrock-mantle.<region>.api.aws.");
  const url = parse(raw);
  if (url.protocol !== "https:") throw new Error("LLM_BASE_URL must use https.");
  if (url.username || url.password || raw.includes("@")) throw new Error("LLM_BASE_URL must not carry credentials.");
  if (url.search || url.hash || raw.includes("?") || raw.includes("#")) throw new Error("LLM_BASE_URL must not carry a query or fragment.");
  if (url.port) throw new Error("LLM_BASE_URL must use the https port.");
  const host = url.hostname.replace(/\.$/, "");
  if (!MANTLE_HOST.test(host)) throw new Error("LLM_BASE_URL host is not valid: it must be bedrock-mantle.<region>.api.aws.");
  if (url.pathname !== "/") throw new Error("LLM_BASE_URL must be an origin only, https://bedrock-mantle.<region>.api.aws, without a path.");
  return `https://${host}`;
}

function parse(raw: string): URL {
  try {
    return new URL(raw);
  } catch {
    throw new Error("LLM_BASE_URL must be an absolute URL with a valid host.");
  }
}
