import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import corpus from "../../../tests/fixtures/llm-base-urls.json";
import { callTool } from "../src/bedrock-chat";
import { chatCompletionsUrl } from "../src/bedrock-url";
import { bedrockUrlOrNull, checkLlmConfig, forgetReports } from "../src/llm-config";
import { spellNumbers } from "../src/spell";

const env = (LLM_BASE_URL?: string, more: object = {}) => ({ LLM_BASE_URL, ...more }) as unknown as Env;
const GEMMA = "google.gemma-4-e2b";
const OSS = "openai.gpt-oss-120b";
const DEFAULT = "https://bedrock-mantle.us-east-1.api.aws";

describe("the Bedrock base URL", () => {
  it("is us-east-1 when unset, and the path comes from the model", () => {
    expect(chatCompletionsUrl(env(), GEMMA)).toBe(`${DEFAULT}/openai/v1/chat/completions`);
    expect(chatCompletionsUrl(env(), OSS)).toBe(`${DEFAULT}/v1/chat/completions`);
  });

  it.each(["", "   ", "\t\n"])("treats %j as unset", (blank) => {
    expect(chatCompletionsUrl(env(blank), OSS)).toBe(`${DEFAULT}/v1/chat/completions`);
  });

  it.each(corpus.origins)("accepts the origin $url, and gives Gemma and gpt-oss their own paths", ({ url, origin }) => {
    expect(chatCompletionsUrl(env(url), GEMMA)).toBe(`${origin}/openai/v1/chat/completions`);
    expect(chatCompletionsUrl(env(url), OSS)).toBe(`${origin}/v1/chat/completions`);
  });

  it.each(corpus.paths)("refuses $url: it is an origin, so the path is the model's", ({ url }) => {
    expect(() => chatCompletionsUrl(env(url), GEMMA)).toThrow("origin only");
  });

  it.each(corpus.refused)("refuses $url", ({ url, tutor }) => {
    expect(() => chatCompletionsUrl(env(url), OSS)).toThrow(tutor);
  });

  it.each(["https://u:SECRETVALUE@evil.com/x", "https://evil.com/?k=SECRETVALUE", "http://SECRETVALUE.example", "https://bedrock-mantle.us-east-1.api.aws/SECRETVALUE"])(
    "does not put %s in the error",
    (url) => {
      let message = "";
      try {
        chatCompletionsUrl(env(url), OSS);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/LLM_BASE_URL/);
      expect(message).not.toContain("SECRETVALUE");
    },
  );

  it("is where the speller sends its call, with the key", async () => {
    const fetched = vi.fn(async () => Response.json({ choices: [{ message: { content: "You said forty-five." } }] }));
    vi.stubGlobal("fetch", fetched);
    const west = env("https://bedrock-mantle.us-west-2.api.aws", { SPELLER_HOST: "bedrock", AWS_BEARER_TOKEN_BEDROCK: "key" });

    await spellNumbers(west, "You said 45.", "en");

    const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://bedrock-mantle.us-west-2.api.aws/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer key");
  });

  it("is not read from a stale AWS_REGION", () => {
    expect(chatCompletionsUrl(env(undefined, { AWS_REGION: "eu-west-1" }), OSS)).toBe(`${DEFAULT}/v1/chat/completions`);
  });
});

describe("a configuration that is wrong is visible", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    forgetReports();
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("says nothing for a good configuration", () => {
    checkLlmConfig(env("https://bedrock-mantle.eu-west-1.api.aws"));
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("warns once of a leftover AWS_REGION, naming the setting to use", () => {
    checkLlmConfig(env(undefined, { AWS_REGION: "eu-west-1" }));
    checkLlmConfig(env(undefined, { AWS_REGION: "eu-west-1" }));
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain("AWS_REGION is set but unused");
    expect(line).toContain("LLM_BASE_URL");
    expect(line).not.toContain("eu-west-1\"");
    expect(error).not.toHaveBeenCalled();
  });

  it("names a bad LLM_BASE_URL once, without its value", () => {
    const bad = "https://u:SECRETVALUE@bedrock-mantle.us-east-1.api.aws";
    checkLlmConfig(env(bad));
    checkLlmConfig(env(bad));
    expect(error).toHaveBeenCalledTimes(1);
    const line = String(error.mock.calls[0][0]);
    expect(line).toContain("must not carry credentials");
    expect(line).not.toContain("SECRETVALUE");
  });

  it("logs the first skipped call, not each, and skips it", () => {
    const bad = env("https://evil.example", { AWS_BEARER_TOKEN_BEDROCK: "key" });
    expect(bedrockUrlOrNull(bad, OSS, "router")).toBeNull();
    expect(bedrockUrlOrNull(bad, OSS, "observer")).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain("router");
  });

  it("answers a router call with nothing and no request when the URL is bad, and says why once", async () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    const bad = env("https://evil.example/v1", { AWS_BEARER_TOKEN_BEDROCK: "key" });
    const request = { model: OSS, system: "s", user: "u", timeoutMs: 100, maxTokens: 10, part: "router", tools: [] };

    expect(await callTool(bad, request)).toBeNull();
    expect(await callTool(bad, request)).toBeNull();

    expect(fetched).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });
});
