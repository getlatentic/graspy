// node --test apps/alexa
import assert from "node:assert/strict";
import { test } from "node:test";
import { completeClean, instructionsFrom, takeTurn, usable } from "./agent.mjs";
import { McpClient } from "./mcp-client.mjs";

const tools = [{ name: "check_answer", description: "Mark it.", inputSchema: { type: "object", properties: { answer: { type: "string" } } } }];

const scripted = (...replies) => async () => replies.shift();

test("a tool the model calls is run on graspy and its result goes back to the model", async () => {
  const calls = [];
  const mcp = { call: async (name, args) => (calls.push([name, args]), { content: [{ type: "text", text: "correct: true" }], structuredContent: { correct: false } }) };
  const complete = scripted(
    { content: "", tool_calls: [{ id: "c1", function: { name: "check_answer", arguments: '{"answer":"twelve"}' } }] },
    { content: "Yes, that is right!" },
  );
  const turn = await takeTurn({ complete, mcp, tools, instructions: "be kind", history: [], said: "twelve" });
  assert.deepEqual(calls, [["check_answer", { answer: "twelve" }]]);
  assert.equal(turn.reply, "Yes, that is right!");
  assert.deepEqual(turn.trace, [{ tool: "check_answer", args: { answer: "twelve" }, result: { correct: false }, error: false }]);
  assert.equal(turn.history.at(-2).role, "tool");
});

test("a tool call whose arguments are not JSON reaches graspy as an empty call, for it to refuse", async () => {
  const mcp = { call: async (_, args) => ({ content: [{ type: "text", text: JSON.stringify(args) }], isError: true }) };
  const complete = scripted({ content: "", tool_calls: [{ id: "c1", function: { name: "check_answer", arguments: "{oops" } }] }, { content: "Let me ask again." });
  const turn = await takeTurn({ complete, mcp, tools, instructions: "be kind", history: [], said: "x" });
  assert.equal(turn.trace[0].error, true);
});

test("a model that never stops calling tools is stopped", async () => {
  const mcp = { call: async () => ({ content: [{ type: "text", text: "ok" }] }) };
  const complete = async () => ({ content: "", tool_calls: [{ id: "c", function: { name: "check_answer", arguments: "{}" } }] });
  const turn = await takeTurn({ complete, mcp, tools, instructions: "be kind", history: [], said: "x" });
  assert.equal(turn.trace.length, 6);
  assert.match(turn.reply, /practise/);
});

test("a reply full of zero-width characters is asked for again", async () => {
  const bad = { content: `How ${"​".repeat(40)} many` };
  const message = await completeClean(scripted(bad, { content: "How many pencils?" }), [], []);
  assert.equal(message.content, "How many pencils?");
});

test("the client sends graspy's session and protocol version, and lists only the model's tools", async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push([url, options.headers.authorization, options.headers["mcp-protocol-version"]]);
    const { method } = JSON.parse(options.body);
    const result = { tools: [{ name: "next_question", _meta: { ui: { visibility: ["model"] } } }, { name: "answer_practice", _meta: { ui: { visibility: ["app"] } } }, { name: "give_practice", _meta: { ui: { visibility: ["model", "app"] } } }] };
    return { ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, result: method === "tools/list" ? result : {} }) };
  };
  const listed = await new McpClient("http://g/mcp/public", "tok", fetchImpl).tools();
  assert.deepEqual(listed.map((t) => t.name), ["next_question"]);
  assert.deepEqual(seen[0], ["http://g/mcp/public", "Bearer tok", "2025-11-25"]);
});

test("a question is said exactly as graspy wrote it, without another model call", async () => {
  const mcp = { call: async () => ({ content: [{ type: "text", text: "q" }], structuredContent: { question_id: "a.1.2", say_to_the_child: "Ada has 2 mangoes and gets 3 more. How many now?" } }) };
  let modelCalls = 0;
  const complete = async () => (modelCalls++, { content: "", tool_calls: [{ id: "c", function: { name: "next_question", arguments: '{"topic":"addition"}' } }] });
  const turn = await takeTurn({ complete, mcp, tools, instructions: "be kind", history: [], said: "a question" });
  assert.equal(turn.reply, "Ada has 2 mangoes and gets 3 more. How many now?");
  assert.equal(modelCalls, 1);
});

test("a degenerate reply is not usable and a plain one is", () => {
  assert.equal(usable("Nice try! Add 2 five times."), true);
  assert.equal(usable("... … ... ..." + " …".repeat(30)), false);
  assert.equal(usable("word ".repeat(200)), false);
});

test("the skill's text after its front matter is the assistant's instructions", () => {
  assert.equal(instructionsFrom("---\nname: x\ndescription: y\n---\n\n# Title\n\nDo it.\n"), "# Title\n\nDo it.");
});

test("a client of the public endpoint sends no authorization", async () => {
  const seen = [];
  const fetchImpl = async (_url, options) => (seen.push(options.headers), { ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, result: { tools: [] } }) });
  await new McpClient("http://g/mcp/public", null, fetchImpl).tools();
  assert.equal("authorization" in seen[0], false);
});

test("a right answer is followed by graspy's next question, asked for by the code and said as written", async () => {
  const calls = [];
  const mcp = {
    call: async (name, args) => {
      calls.push([name, args]);
      return name === "check_answer"
        ? { content: [{ type: "text", text: "ok" }], structuredContent: { correct: true, feedback: "Yes, 7 times 10 is 70." } }
        : { content: [{ type: "text", text: "q" }], structuredContent: { question_id: "multiplication.2.9", say_to_the_child: "Ada has 3 bags with 4 eggs in each bag. How many eggs?" } };
    },
  };
  const complete = async () => ({ content: "", tool_calls: [{ id: "c", function: { name: "check_answer", arguments: '{"question_id":"multiplication.2.123","answer":"70"}' } }] });
  const turn = await takeTurn({ complete, mcp, tools, instructions: "be kind", history: [], said: "seventy" });
  assert.deepEqual(calls[1], ["next_question", { topic: "multiplication", level: 2 }]);
  assert.equal(turn.reply, "Yes, 7 times 10 is 70. Here is another one. Ada has 3 bags with 4 eggs in each bag. How many eggs?");
  assert.deepEqual(turn.trace.map((step) => step.tool), ["check_answer", "next_question"]);
});

test("a worked answer is followed by graspy's next question too, and the model's own working is not said", async () => {
  const mcp = {
    call: async (name) =>
      name === "show_working"
        ? { content: [{ type: "text", text: "w" }], structuredContent: { answer: 70, working: "7 times 10 is 70." } }
        : { content: [{ type: "text", text: "q" }], structuredContent: { say_to_the_child: "Ada has 3 bags with 4 eggs in each bag. How many eggs?" } },
  };
  const complete = async () => ({ content: "", tool_calls: [{ id: "c", function: { name: "show_working", arguments: '{"question_id":"multiplication.1.5"}' } }] });
  const turn = await takeTurn({ complete, mcp, tools, instructions: "be kind", history: [], said: "tell me" });
  assert.equal(turn.reply, "The answer is 70. 7 times 10 is 70. Here is another one. Ada has 3 bags with 4 eggs in each bag. How many eggs?");
});
