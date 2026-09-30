import type { Persona } from "./personas.ts";
import type { ChildTurn } from "./turn-log.ts";

/** Not an Anthropic model: graspy's work never uses one, and that includes its tests. */
export const CHILD_MODEL = "openai.gpt-oss-120b";
const ENDPOINT = "https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions";
const HISTORY_TURNS = 6;

export interface Exchange {
  teacherSaid: string;
  childSaid: string | null;
  teacherReplied: string | null;
}

export interface Prompt {
  teacherSays: string;
  teacherShows: string | null;
  learnerClass: string;
  history: Exchange[];
}

const FORMAT =
  'Reply with only JSON: {"say": string or null, "isRight": true|false|null, "note": string}. ' +
  '"say" is exactly the words you speak aloud, or null if you stay silent. ' +
  '"isRight" is whether what you say answers the teacher correctly, or null if it answers nothing. ' +
  '"note" is one short sentence on why you answered that way.';

export function childMessages(persona: Persona, prompt: Prompt) {
  const recent = prompt.history.slice(-HISTORY_TURNS).map((turn) => {
    const child = turn.childSaid === null ? "(stayed silent)" : turn.childSaid;
    const reply = turn.teacherReplied ? `\nTeacher then said: ${turn.teacherReplied}` : "";
    return `Teacher: ${turn.teacherSaid}\nYou: ${child}${reply}`;
  });
  const shown = prompt.teacherShows ? `\nOn the screen: ${prompt.teacherShows}` : "";
  return [
    {
      role: "system",
      content: `${persona.behaviour} You are in ${prompt.learnerClass.replace("_", " ")}. ${FORMAT}`,
    },
    {
      role: "user",
      content: `${recent.join("\n\n")}${recent.length ? "\n\n" : ""}The teacher now says: ${prompt.teacherSays}${shown}\n\nWhat do you say?`,
    },
  ];
}

/** The first JSON object in a model's reply, however it is wrapped. */
export function parseChildTurn(reply: string): ChildTurn {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`The child model gave no JSON: ${reply.slice(0, 200)}`);
  const parsed = JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>;
  const said = typeof parsed.say === "string" && parsed.say.trim() ? parsed.say.trim() : null;
  return {
    said,
    isRight: typeof parsed.isRight === "boolean" ? parsed.isRight : null,
    note: typeof parsed.note === "string" ? parsed.note : "",
  };
}

export async function decideWhatToSay(
  key: string,
  persona: Persona,
  prompt: Prompt,
): Promise<ChildTurn> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: CHILD_MODEL,
      messages: childMessages(persona, prompt),
      max_completion_tokens: 1200,
      reasoning_effort: "low",
    }),
  });
  if (!response.ok) throw new Error(`The child model answered ${response.status}`);
  const body = (await response.json()) as { choices: { message: { content: string } }[] };
  return parseChildTurn(body.choices[0].message.content);
}
