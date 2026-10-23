// The simulated Alexa+: a conversational model that calls graspy's tutor tools over MCP.

const MAX_STEPS = 6;
// The hosted model sometimes degenerates into zero-width characters or runs of dots; such a reply is asked for again.
const GLITCH = /[\u200B-\u200D\u2060\uFEFF]{3,}/;
const MAX_REPLY = 400;

export function usable(text) {
  if (GLITCH.test(text) || text.length > MAX_REPLY) return false;
  const marks = text.replace(/\s/g, "");
  return marks.length === 0 || (marks.match(/[\p{L}\p{N}]/gu) ?? []).length / marks.length > 0.6;
}

export const PERSONA = `You are Alexa, talking aloud with a child who is learning maths. You are warm, brief and playful: one to three short sentences, no lists, no markdown, nothing that cannot be said aloud.

You do not teach maths yourself. A tutor called graspy does it through your tools:
- next_question gives a question. Say its say_to_the_child text to the child as it is, then wait.
- check_answer marks what the child said. It alone decides right or wrong; never work the answer out yourself or contradict it.
- hint gives a nudge. After a wrong answer, or when the child is stuck, call hint and say its nudge in your own words. Never say the answer yourself.
- show_working gives the worked answer when the child gives up or asks for it. Say it kindly, then offer a new question; do not say "great job" for an answer you told them.
Never make up a question, a number or a hint yourself: every question comes from next_question, so that its answer can be marked. Remember the question_id of the question you are on. After two right answers in a row, ask for level 2 or 3; after a wrong one, go easier. Topics are addition, subtraction, multiplication, sharing and parts of a number: offer one if the child does not choose. If the child talks about something else, answer kindly and briefly, then offer a maths question.`;

export const toOpenAiTool = (tool) => ({
  type: "function",
  function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
});

const textOf = (result) => (result.content ?? []).map((part) => part.text ?? "").join("\n");

export async function completeClean(complete, messages, tools) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const message = await complete(messages, tools);
    if (message.tool_calls?.length || usable(message.content ?? "")) return message;
  }
  return { content: "Sorry, say that once more for me?" };
}

/**
 * One turn: the child's words in, Alexa's words out, calling graspy as often as she needs.
 * `history` carries the earlier turns, tool calls included, so the question being asked is remembered.
 */
export async function takeTurn({ complete, mcp, tools, history, said }) {
  const messages = [...history, { role: "user", content: said }];
  const trace = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const message = await completeClean(complete, [{ role: "system", content: PERSONA }, ...messages], tools.map(toOpenAiTool));
    messages.push({ role: "assistant", content: message.content ?? "", ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}) });
    if (!message.tool_calls?.length) return { reply: (message.content ?? "").trim(), history: messages, trace };
    let spoken = null;
    for (const call of message.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // Reported to the model below as the tool's error.
      }
      const result = await mcp.call(call.function.name, args);
      trace.push({ tool: call.function.name, args, result: result.structuredContent ?? textOf(result), error: result.isError === true });
      messages.push({ role: "tool", tool_call_id: call.id, content: textOf(result) });
      if (call.function.name === "next_question" && !result.isError) spoken = result.structuredContent?.say_to_the_child ?? null;
    }
    // A question is said as graspy wrote it: the model has nothing to add to it.
    if (spoken) {
      messages.push({ role: "assistant", content: spoken });
      return { reply: spoken, history: messages, trace };
    }
  }
  return { reply: "Let's try that again. What would you like to practise?", history: messages, trace };
}

export function bedrock({ key, region = "us-east-1", model = "openai.gpt-oss-120b", fetchImpl = fetch }) {
  const url = `https://bedrock-mantle.${region}.api.aws/v1/chat/completions`;
  return async (messages, tools) => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages, tools, tool_choice: "auto", temperature: 0.3, max_completion_tokens: 800, reasoning_effort: "low" }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`Bedrock answered ${response.status}`);
    return (await response.json()).choices[0].message;
  };
}
