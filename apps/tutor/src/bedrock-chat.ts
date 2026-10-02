import { bedrockPath } from "./speller-host";

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

interface Request {
  model: string;
  system: string;
  user: string;
  timeoutMs: number;
  maxTokens: number;
  part: string;
  /** When to send the second request; `HEDGE_AFTER_MS` unless given. */
  hedgeAfterMs?: number;
}

type Message = { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] };

/** A second request is sent when the first has not answered by then: the host's slow calls are a few in ten, not the next one. */
export const HEDGE_AFTER_MS = 1200;

/**
 * The first answer of an attempt and, if it has not answered by `afterMs`, a second identical one, with the slower given up
 * on; null where neither answers within `timeoutMs`. An attempt that fails at once starts the second at once.
 */
async function hedged<T>(attempt: (signal: AbortSignal) => Promise<T | null>, afterMs: number, timeoutMs: number): Promise<T | null> {
  const stops = [new AbortController(), new AbortController()];
  const deadline = AbortSignal.timeout(timeoutMs);
  const run = (at: 0 | 1) => attempt(AbortSignal.any([stops[at].signal, deadline])).then((value) => value ?? Promise.reject(new Error("no answer")));
  const first = run(0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const second = new Promise<T>((resolve, reject) => {
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      run(1).then(resolve, reject);
    };
    timer = setTimeout(start, Math.min(afterMs, timeoutMs));
    first.catch(start);
  });
  try {
    return await Promise.any([first, second]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer ?? null);
    stops.forEach((stop) => stop.abort());
  }
}

async function complete(env: Env, request: Request, extra: object): Promise<Message | null> {
  if (!env.AWS_BEARER_TOKEN_BEDROCK) return null;
  const url = `https://bedrock-mantle.${env.AWS_REGION || "us-east-1"}.api.aws${bedrockPath(request.model)}/chat/completions`;
  const body = JSON.stringify({
    model: request.model,
    messages: [{ role: "system", content: request.system }, { role: "user", content: request.user }],
    temperature: 0,
    max_completion_tokens: request.maxTokens,
    ...extra,
  });
  const headers = { authorization: `Bearer ${env.AWS_BEARER_TOKEN_BEDROCK}`, "content-type": "application/json" };
  return hedged<Message>(async (signal) => {
    const response = await fetch(url, { method: "POST", headers, body, signal });
    if (!response.ok) {
      console.log(JSON.stringify({ part: request.part, status: response.status }));
      return null;
    }
    return ((await response.json()) as { choices?: { message?: Message }[] }).choices?.[0]?.message ?? null;
  }, request.hedgeAfterMs ?? HEDGE_AFTER_MS, request.timeoutMs);
}

const objectOf = (text: string | null | undefined, part: string): Record<string, unknown> | null => {
  try {
    const value = JSON.parse(text || "{}") as unknown;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // Reported below with the rest: the words are the child's and are not logged.
  }
  console.log(JSON.stringify({ part, error: "the reply was not a JSON object" }));
  return null;
};

/**
 * One call to a model on Bedrock that must answer by calling a tool, and the first tool it called; null where the key is
 * missing, the call failed or timed out, or the arguments were not JSON. The caller verifies what the tool reports.
 */
export async function callTool(env: Env, request: Request & { tools: object[] }): Promise<ToolCall | null> {
  const { tools, ...rest } = request;
  const call = (await complete(env, rest, { tools, tool_choice: "auto" }))?.tool_calls?.[0]?.function;
  const args = call?.name === undefined ? null : objectOf(call.arguments, request.part);
  return call?.name === undefined || args === null ? null : { name: call.name, args };
}

/**
 * One call to a model on Bedrock that must answer with a JSON object of the given schema (structured output), and that
 * object; null where the call failed or the reply was not one. The caller verifies what it reports.
 */
export async function callJson(env: Env, request: Request & { schema: object; name: string }): Promise<Record<string, unknown> | null> {
  const { schema, name, ...rest } = request;
  const message = await complete(env, rest, { response_format: { type: "json_schema", json_schema: { name, schema, strict: false } } });
  return message === null ? null : objectOf(message.content, request.part);
}
