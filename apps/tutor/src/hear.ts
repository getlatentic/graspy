/**
 * What a child most likely said, when the recogniser's words are not an answer.
 *
 * Recognisers mishear young children constantly, and in ways a person would not: "Aid" for eight,
 * "tree" for three, "to" for two, "sicks" for six. A child who said the right thing and was written
 * down wrong must not lose a mark for it, so a reading that carries no number is offered to a model
 * before it is given up on.
 *
 * This call is deliberately blind. It is told the shape of the answer and never its value, and it
 * never sees the question, because a model that knows the right answer will hear the right answer.
 * All it does is turn sounds back into the word they came from; whether that word is right is still
 * settled afterwards, by comparison, in code.
 */

import { spokenNumber } from "./mark";

const MODEL = "@cf/openai/gpt-oss-120b";

function brief(heard: string): string {
  return [
    "A young Nigerian child said a number out loud and a speech recogniser wrote it down wrongly.",
    "Say which number they spoke, going by how the written words sound when read aloud.",
    "",
    "Recognisers mishear Nigerian children in regular ways. Some real examples:",
    "  Aid, ate, eat -> 8      tree, free, tri -> 3      to, too, tu -> 2",
    "  sicks, seeks -> 6       tin, teen -> 10           fifty sicks -> 56",
    "  ni, nain -> 9           faif, fife -> 5           seben -> 7",
    "",
    `The recogniser wrote: ${heard}`,
    "",
    "Reply with digits only, and nothing else at all. Reply with the single word none only when the",
    "words do not sound like any number, for instance when the child said they did not know.",
  ].join("\n");
}

/** The number behind a mangled recognition, or null when there is no number in it. */
export async function hearNumber(env: Env, heard: string): Promise<number | null> {
  const reply = (await env.AI.run(MODEL, {
    messages: [{ role: "user", content: brief(heard) }],
    temperature: 0,
    max_tokens: 200,
    reasoning_effort: "low",
  })) as { choices?: { message: { content?: string } }[] };
  const answer = (reply.choices?.[0]?.message?.content ?? "").trim();
  return spokenNumber(answer);
}
