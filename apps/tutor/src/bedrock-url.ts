/**
 * Where Bedrock's OpenAI-compatible endpoint is. `LLM_BASE_URL` is the only setting: its host carries the
 * region, so there is none of its own. The key is sent to that host, so only `bedrock-mantle.<region>.api.aws`
 * over https, with no credentials in the URL, is accepted.
 */
export const DEFAULT_BASE_URL = "https://bedrock-mantle.us-east-1.api.aws";

const MANTLE_HOST = /^bedrock-mantle\.[a-z0-9-]+\.api\.aws$/;
const PATH = /^(\/[A-Za-z0-9-]+)*$/;

/** Bedrock serves Gemma 4 on its /openai/v1 path and the other open models on /v1. */
export function bedrockPath(model: string): string {
  return model.startsWith("google.gemma-4") ? "/openai/v1" : "/v1";
}

/**
 * The chat completions URL for a model. A base URL with no path takes the model's path; one with a path
 * (the server's `https://bedrock-mantle.us-east-1.api.aws/v1`) is used as written.
 */
export function chatCompletionsUrl(env: Env, model: string): string {
  const url = parse(env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL);
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path || bedrockPath(model)}/chat/completions`;
}

function parse(raw: string): URL {
  if (!/^[\x21-\x7e]+$/.test(raw)) throw new Error("LLM_BASE_URL must be plain ASCII.");
  if (/%|\/\.\.?(\/|$)/.test(raw)) throw new Error("LLM_BASE_URL has a path that is not plain.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("LLM_BASE_URL must be an absolute URL.");
  }
  if (url.protocol !== "https:") throw new Error("LLM_BASE_URL must use https.");
  if (url.username || url.password || raw.includes("@")) throw new Error("LLM_BASE_URL must not carry credentials.");
  if (url.port) throw new Error("LLM_BASE_URL must use the https port.");
  if (url.search || url.hash || raw.includes("?") || raw.includes("#")) throw new Error("LLM_BASE_URL must not carry a query or fragment.");
  const host = url.hostname.replace(/\.$/, "");
  if (!MANTLE_HOST.test(host)) throw new Error("LLM_BASE_URL host must be bedrock-mantle.<region>.api.aws.");
  if (!PATH.test(url.pathname.replace(/\/+$/, ""))) throw new Error("LLM_BASE_URL has a path that is not plain.");
  return new URL(`https://${host}${url.pathname}`);
}
