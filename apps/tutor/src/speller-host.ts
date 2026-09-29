/**
 * Where the spelling model runs: Cloudflare's Workers AI, which the rest of the tutor already uses, or
 * Amazon Bedrock, whose bill takes the AWS credits. `SPELLER_HOST` picks one ("workers-ai" when unset,
 * or "bedrock"); nothing else changes. Both serve the same open model, gpt-oss-20b.
 */
export const WORKERS_AI_MODEL = "@cf/openai/gpt-oss-20b";
export const BEDROCK_MODEL = "openai.gpt-oss-20b";

type Complete = (env: Env, prompt: string) => Promise<unknown>;

const workersAi: Complete = async (env, prompt) => {
  const reply = (await env.AI.run(WORKERS_AI_MODEL, {
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 600,
  })) as { choices?: { message?: { content?: unknown } }[]; response?: unknown };
  return reply.choices?.[0]?.message?.content ?? reply.response;
};

const bedrock: Complete = async (env, prompt) => {
  if (!env.AWS_BEARER_TOKEN_BEDROCK) throw new Error("SPELLER_HOST is bedrock but AWS_BEARER_TOKEN_BEDROCK is not set");
  const region = env.AWS_REGION || "us-east-1";
  const response = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.AWS_BEARER_TOKEN_BEDROCK}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: BEDROCK_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_completion_tokens: 600,
      reasoning_effort: "low",
    }),
  });
  if (!response.ok) throw new Error(`Bedrock answered ${response.status}`);
  const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  return body.choices?.[0]?.message?.content;
};

const HOSTS: Record<string, Complete> = { "workers-ai": workersAi, bedrock };

/** The model's reply to one prompt, from the host this Worker is set to. */
export function complete(env: Env, prompt: string): Promise<unknown> {
  const host = HOSTS[env.SPELLER_HOST || "workers-ai"];
  if (!host) throw new Error(`SPELLER_HOST must be workers-ai or bedrock, not ${env.SPELLER_HOST}`);
  return host(env, prompt);
}
