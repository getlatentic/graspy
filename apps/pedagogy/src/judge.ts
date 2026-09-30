/** Not an Anthropic model, as graspy's own rule has it for anything that judges. */
export const JUDGE_MODEL = "deepseek.v3.2";
const ENDPOINT = "https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions";

export const CRITERIA: Record<string, string> = {
  sequence: "The lesson follows the nine events of instruction in a sensible order and does not jump around.",
  correctness: "Everything the teacher says is factually and mathematically right.",
  feedback: "Feedback on a wrong answer is specific and kind, helps the child find the answer, and does not simply give it away or simply repeat itself.",
  pacing: "Each line is short enough for the child's age and asks one thing at a time.",
  language: "Words are plain and suited to a young Nigerian child in the lesson's language.",
  resilience: "A child who is silent, unsure, or off topic is supported and brought back, not ignored or scolded.",
  progress: "The child is moved forward toward the lesson's goal and does not loop.",
};

export interface Judgement {
  summary: string;
  scores: { criterion: string; score: number; evidence: string }[];
}

export function judgeMessages(transcript: string) {
  const rubric = Object.entries(CRITERIA).map(([name, text]) => `- ${name}: ${text}`).join("\n");
  return [
    {
      role: "system",
      content:
        "You review a recorded voice lesson between an AI teacher and a simulated child, as an experienced primary-school teacher would. " +
        'Score each criterion from 1 (poor) to 5 (excellent). Quote the words that justify each score. Where the transcript shows the recogniser mishearing the child, do not blame the teacher for it. ' +
        'Reply with only JSON: {"summary": string, "scores": [{"criterion": string, "score": number, "evidence": string}]}.\n\nCriteria:\n' +
        rubric,
    },
    { role: "user", content: transcript },
  ];
}

export function parseJudgement(reply: string): Judgement {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`The judge gave no JSON: ${reply.slice(0, 200)}`);
  const parsed = JSON.parse(reply.slice(start, end + 1)) as Judgement;
  const known = Object.keys(CRITERIA);
  const scores = (parsed.scores ?? []).filter((row) => known.includes(row.criterion) && row.score >= 1 && row.score <= 5);
  return { summary: String(parsed.summary ?? ""), scores };
}

export async function judgeTranscript(key: string, transcript: string): Promise<Judgement> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: JUDGE_MODEL, messages: judgeMessages(transcript), max_completion_tokens: 4000 }),
  });
  if (!response.ok) throw new Error(`The judge answered ${response.status}`);
  const body = (await response.json()) as { choices: { message: { content: string } }[] };
  return parseJudgement(body.choices[0].message.content);
}

/**
 * The judge's reading of a run, or null when it cannot give one. It is a pointer for a reviewer, so a reply that
 * is not JSON, as the model sometimes gives, is asked for again once and never costs the run its transcript.
 */
export async function judgedOrNull(key: string, transcript: string, attempts = 2): Promise<Judgement | null> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await judgeTranscript(key, transcript);
    } catch (error) {
      console.warn(`The judge did not give a reading (attempt ${attempt} of ${attempts}): ${error instanceof Error ? error.message : error}`);
    }
  }
  return null;
}
