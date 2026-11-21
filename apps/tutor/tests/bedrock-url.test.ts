import { describe, expect, it, vi } from "vitest";
import { chatCompletionsUrl } from "../src/bedrock-url";
import { spellNumbers } from "../src/spell";

const env = (LLM_BASE_URL?: string) => ({ LLM_BASE_URL }) as unknown as Env;
const GEMMA = "google.gemma-4-e2b";
const OSS = "openai.gpt-oss-120b";

describe("the Bedrock base URL", () => {
  it("is us-east-1, with the model's path, when unset", () => {
    expect(chatCompletionsUrl(env(), GEMMA)).toBe("https://bedrock-mantle.us-east-1.api.aws/openai/v1/chat/completions");
    expect(chatCompletionsUrl(env(""), OSS)).toBe("https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions");
  });

  it("takes the region from the host, and the model's path when the URL has none", () => {
    expect(chatCompletionsUrl(env("https://bedrock-mantle.eu-west-1.api.aws"), OSS)).toBe(
      "https://bedrock-mantle.eu-west-1.api.aws/v1/chat/completions",
    );
    expect(chatCompletionsUrl(env("https://bedrock-mantle.eu-west-1.api.aws/"), GEMMA)).toBe(
      "https://bedrock-mantle.eu-west-1.api.aws/openai/v1/chat/completions",
    );
  });

  it("uses a path it is given as written, as the server does", () => {
    expect(chatCompletionsUrl(env("https://bedrock-mantle.us-west-2.api.aws/openai/v1/"), OSS)).toBe(
      "https://bedrock-mantle.us-west-2.api.aws/openai/v1/chat/completions",
    );
  });

  it("reads the host lower-cased, without a trailing dot, with port 443 or none", () => {
    expect(chatCompletionsUrl(env("https://BEDROCK-MANTLE.US-WEST-2.API.AWS.:443"), OSS)).toBe(
      "https://bedrock-mantle.us-west-2.api.aws/v1/chat/completions",
    );
  });

  it.each([
    "https://bedrock-mantle.us-east-1.api.aws.evil.com",
    "https://bedrock-mantle.us-east-1.api.aws@evil.com",
    "https://bedrock-mantle.us-east-1.api.aws:evil@evil.com",
    "https://user:pass@bedrock-mantle.us-east-1.api.aws",
    "https://bedrock-mantle..api.aws",
    "https://bedrock-mantle.us-east-1.amazonaws.com",
    "https://bedrock-runtime.us-east-1.api.aws",
    "https://bedrock-mantle.us_east_1.api.aws",
    "https://bedrock-mantle.us.east.api.aws",
    "https://bedrock-mantle.us-ëast-1.api.aws",
    "https://bedrock-mantle.us-east-1.api.аws",
    "http://bedrock-mantle.us-east-1.api.aws",
    "https://bedrock-mantle.us-east-1.api.aws:8443",
    "https://bedrock-mantle.us-east-1.api.aws/v1?key=1",
    "https://bedrock-mantle.us-east-1.api.aws/v1#top",
    "https://bedrock-mantle.us-east-1.api.aws/../v1",
    "https://bedrock-mantle.us-east-1.api.aws/v1/%2e%2e",
    "bedrock-mantle.us-east-1.api.aws",
    "https://localhost/v1",
  ])("refuses %s, so the key goes nowhere else", (raw) => {
    expect(() => chatCompletionsUrl(env(raw), OSS)).toThrow(/LLM_BASE_URL/);
  });

  it("does not put the URL in the error", () => {
    expect(() => chatCompletionsUrl(env("https://u:secret@evil.com"), OSS)).toThrow(/^(?!.*secret)/);
  });

  it("is where the speller sends its call, with the key", async () => {
    const fetched = vi.fn(async () => Response.json({ choices: [{ message: { content: "You said forty-five." } }] }));
    vi.stubGlobal("fetch", fetched);
    const west = { SPELLER_HOST: "bedrock", AWS_BEARER_TOKEN_BEDROCK: "key", LLM_BASE_URL: "https://bedrock-mantle.us-west-2.api.aws" } as unknown as Env;

    await spellNumbers(west, "You said 45.", "en");

    const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://bedrock-mantle.us-west-2.api.aws/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer key");
  });

  it("is not read from a stale AWS_REGION", () => {
    const stale = { AWS_REGION: "eu-west-1" } as unknown as Env;
    expect(chatCompletionsUrl(stale, OSS)).toBe("https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions");
  });
});
