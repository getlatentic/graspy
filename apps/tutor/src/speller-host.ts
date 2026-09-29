/**
 * Where the spelling model runs: Cloudflare's Workers AI, which the rest of the tutor already uses, or
 * Amazon Bedrock, whose bill takes the AWS credits. `SPELLER_HOST` picks one ("workers-ai" when unset,
 * or "bedrock") and `SPELLER_MODEL` the model on it; each host has a default.
 */
export const DEFAULT_MODEL = { "workers-ai": "@cf/openai/gpt-oss-20b", bedrock: "google.gemma-4-e2b" } as const;

/**
 * Either host now and then stalls for ten seconds or more on one call, measured on both. Spelling a
 * line is worth about a second of a child's wait, so a call still out after this is given up on and
 * the line goes back to the teacher as it was.
 */
export const SPELL_TIMEOUT_MS = 4_000;

type Complete = (env: Env, prompt: string) => Promise<unknown>;

const workersAi: Complete = async (env, prompt) => {
  const reply = (await env.AI.run(env.SPELLER_MODEL || DEFAULT_MODEL["workers-ai"], {
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 600,
  })) as { choices?: { message?: { content?: unknown } }[]; response?: unknown };
  return reply.choices?.[0]?.message?.content ?? reply.response;
};

/** Bedrock serves Gemma 4 on its /openai/v1 path and the other open models on /v1. */
export function bedrockPath(model: string): string {
  return model.startsWith("google.gemma-4") ? "/openai/v1" : "/v1";
}

/** Only the gpt-oss models take a reasoning setting; the others answer an unknown parameter with a 400. */
function bedrockBody(model: string, prompt: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_completion_tokens: 600,
  };
  if (model.startsWith("openai.gpt-oss")) body.reasoning_effort = "low";
  return body;
}

const bedrock: Complete = async (env, prompt) => {
  if (!env.AWS_BEARER_TOKEN_BEDROCK) throw new Error("SPELLER_HOST is bedrock but AWS_BEARER_TOKEN_BEDROCK is not set");
  const region = env.AWS_REGION || "us-east-1";
  const model = env.SPELLER_MODEL || DEFAULT_MODEL.bedrock;
  const response = await fetch(`https://bedrock-mantle.${region}.api.aws${bedrockPath(model)}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.AWS_BEARER_TOKEN_BEDROCK}`, "content-type": "application/json" },
    body: JSON.stringify(bedrockBody(model, prompt)),
    signal: AbortSignal.timeout(SPELL_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Bedrock answered ${response.status}`);
  const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  return body.choices?.[0]?.message?.content;
};

const HOSTS: Record<string, Complete> = { "workers-ai": workersAi, bedrock };

/** The model's reply to one prompt, from the host this Worker is set to, or a rejection once it is late. */
export function complete(env: Env, prompt: string): Promise<unknown> {
  const host = HOSTS[env.SPELLER_HOST || "workers-ai"];
  if (!host) throw new Error(`SPELLER_HOST must be workers-ai or bedrock, not ${env.SPELLER_HOST}`);
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`the speller took over ${SPELL_TIMEOUT_MS} ms`)), SPELL_TIMEOUT_MS);
  });
  return Promise.race([host(env, prompt), late]).finally(() => clearTimeout(timer));
}
