/**
 * What to do with what a child said, when it is no number.
 *
 * A child in a conversation does not only answer: they say they do not know (in Pidgin as well), ask to hear the
 * question again, ask something, say they are hungry. The words are read in the context of the question just asked
 * and one action is chosen from a few, the way a model chooses a tool. Cloudflare's Clef chooses first, with a
 * probability for each, and a fast language model chooses when Clef is not sure enough.
 *
 * Judging is not done here. The action "this is an answer" goes back to the marking that reads and checks the number;
 * no number is ever taken from this choice, since a model asked to route garbled words sometimes invents one.
 * The question is given, the right answer never.
 */

import { fitForChild, heardForPrompt, lineProblems, safeForChild } from "./guard";
import { CLEF_MODEL, fewWords } from "./interpret";
import { markAnswer, spokenNumber } from "./mark";
import { correctionLine, notHeardLine } from "./praise";
import { bedrockPath } from "./speller-host";
import type { Ask, Reply } from "./turn";

export const ROUTER_MODEL = "google.gemma-4-26b-a4b";
/** How sure Clef must be of the action before the language model is not asked. */
export const ROUTE_MIN = 0.7;
const ROUTE_TIMEOUT_MS = 4000;

export type Action = "mark_answer" | "ask_again" | "not_know" | "repeat_question" | "answer_child";
export interface Route {
  action: Action;
  /** The one kind sentence for a child who said something else, when that was chosen. */
  reply?: string;
}

const ACTIONS: Record<Action, string> = {
  mark_answer: "the child gave a number as their answer, possibly written as a similar-sounding word",
  ask_again: "the words are garbled or unrelated and no number can be told",
  not_know: "the child says they do not know, cannot remember or are not sure, in English or Nigerian Pidgin",
  repeat_question: "the child asks to hear the question again, or says they did not hear it",
  answer_child: "the child asked a question or said something else, such as being hungry or needing the toilet",
};

const SETTING =
  "A young Nigerian child is talking with their teacher, and a speech recogniser wrote down what the child said, often wrongly: " +
  "a number word may be written as another word that sounds like it. ";

const SYSTEM =
  `${SETTING}You never judge whether an answer is right: a program does that. You never answer the maths question yourself. ` +
  "You decide only what to do with what the child said, by calling exactly one tool. Always call one tool. " +
  Object.entries(ACTIONS).map(([name, what]) => `${name}: ${what}.`).join(" ") +
  " For answer_child, give a short kind reply of one sentence that brings the child back to the question.";

const TOOLS = (Object.keys(ACTIONS) as Action[]).map((name) => ({
  type: "function",
  function: {
    name,
    description: ACTIONS[name],
    parameters: name === "answer_child" ? { type: "object", properties: { reply: { type: "string" } }, required: ["reply"] } : { type: "object", properties: {} },
  },
}));

/** Whether the words hold a number a child could have said, which marking reads and checks: no need to route it. */
export function holdsANumber(heard: string): boolean {
  return heard.toLowerCase().split(/[^a-z0-9]+/).some((word) => word !== "" && (/^\d+$/.test(word) || spokenNumber(word) !== null));
}

const context = (ask: Ask, heard: string) => `The question just asked: ${ask.prompt}\nThe recogniser wrote what the child said: ${heard}`;

type Probabilities = Record<string, number>;

async function chosenByClef(env: Env, ask: Ask, heard: string): Promise<Action | null> {
  const reply = (await env.AI.run(CLEF_MODEL, {
    model: "clef",
    state: context(ask, heard),
    questions: { action: { type: "choice", instructions: `${SETTING}What should the teacher do with it?`, criteria: ACTIONS } },
  })) as { answers?: { action?: { probabilities?: Probabilities } } };
  const entries = Object.entries(reply.answers?.action?.probabilities ?? {});
  const total = entries.reduce((sum, [, p]) => sum + p, 0);
  if (entries.length === 0 || Math.abs(total - 1) > 0.1) return null;
  const [name, p] = entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  return p >= ROUTE_MIN && name in ACTIONS ? (name as Action) : null;
}

async function chosenByModel(env: Env, ask: Ask, heard: string): Promise<Route | null> {
  if (!env.AWS_BEARER_TOKEN_BEDROCK) return null;
  const model = env.ROUTER_MODEL || ROUTER_MODEL;
  const response = await fetch(`https://bedrock-mantle.${env.AWS_REGION || "us-east-1"}.api.aws${bedrockPath(model)}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.AWS_BEARER_TOKEN_BEDROCK}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: context(ask, heard) }],
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0,
      max_completion_tokens: 300,
    }),
    signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[] };
  const call = body.choices?.[0]?.message?.tool_calls?.[0]?.function;
  if (call?.name === undefined || !(call.name in ACTIONS)) return null;
  let reply: unknown;
  try { reply = (JSON.parse(call.arguments || "{}") as { reply?: unknown }).reply; } catch { return null; }
  return { action: call.name as Action, ...(typeof reply === "string" ? { reply } : {}) };
}

/** The action for what the child said, from Clef where it is sure and from the language model where it is not; null where neither could say. */
export async function routeUtterance(env: Env, ask: Ask): Promise<Route | null> {
  const heard = heardForPrompt(ask.heard);
  const sure = await Promise.race([chosenByClef(env, ask, heard).catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ROUTE_TIMEOUT_MS))]);
  if (sure !== null && sure !== "answer_child") return { action: sure };
  // A reply to what a child said is written by the language model, so it is asked even where Clef was sure.
  return chosenByModel(env, ask, heard).catch(() => null);
}

/**
 * The reply to the chosen action, or null where the usual marking should go on. Every action but "an answer" ends the
 * turn as one nobody could mark: it is no try, and the same question is asked again.
 */
export async function repliedTo(env: Env, ask: Ask, route: Route): Promise<Reply | null> {
  if (ask.expect.kind !== "fact") return null;
  const unheard = markAnswer(ask.expect.item, null);
  switch (route.action) {
    case "mark_answer":
      return null;
    case "not_know": {
      const line = correctionLine(ask, false);
      return line === null ? null : { ...unheard, heard: "dont_know", say: line };
    }
    case "repeat_question":
      return { ...unheard, heard: "nothing", say: ask.prompt };
    case "ask_again": {
      const line = notHeardLine(ask);
      return line === null || !fewWords(ask.heard) ? null : { ...unheard, heard: "garbled", say: line };
    }
    case "answer_child": {
      const line = (route.reply ?? "").trim();
      if (line === "" || lineProblems(line).length > 0) return null;
      const [safe, fit] = await Promise.all([safeForChild(env, ask.heard, line), fitForChild(env, ask.heard, line)]).catch(() => [false, false]);
      return safe && fit ? { ...unheard, heard: "garbled", say: line } : null;
    }
  }
}
