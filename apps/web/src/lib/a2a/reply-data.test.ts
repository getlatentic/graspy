import { describe, expect, it } from "vitest";
import contract from "@/lib/a2a/reply-contract.json";
import { agentData, ROLE_AGENT, TUTOR_TOOLS } from "@/lib/a2a/reply-data";
import { appCall, messageParts } from "@/lib/a2a/request-data";
import ar from "@/locales/ar.json";
import en from "@/locales/en.json";
import yo from "@/locales/yo.json";

const replyOf = (data: unknown) => ({
  role: ROLE_AGENT,
  parts: [
    { content: { $case: "text", value: "Here you go." } },
    { content: { $case: "data", value: data } },
  ],
});

// apps/server/scripts/export_reply_contract.py writes the contract.
describe("the server's reply contract", () => {
  it("parses every kind of action and card the server sends, dropping none", () => {
    expect(agentData(replyOf(contract.reply))).toEqual(contract.reply);
  });

  it("names every tool the server has, in every language", () => {
    const names = contract.tools.map((tool) => tool.name);
    expect([...TUTOR_TOOLS]).toEqual(names);
    for (const locale of [en, yo, ar]) {
      expect(Object.keys(locale.chat.activity).sort()).toEqual(
        [...names].sort(),
      );
    }
  });

  it("hosts every UI a tool declares, knowing nothing of what it shows", () => {
    const declared = contract.tools.flatMap((tool) =>
      "ui" in tool ? [tool.ui] : [],
    );
    const sent = contract.reply.cards.map((card) => card.resourceUri);
    expect(sent.sort()).toEqual([...declared].sort());
  });

  it("passes a view's tools/call on in the shape the server reads", () => {
    const [expected] = contract.request.appCalls;
    const call = appCall(expected.params.name, expected.params.arguments);

    expect({ ...call, id: expected.id }).toEqual(expected);
    expect(messageParts("Explain the answer", { calls: [call] })).toEqual([
      { content: { $case: "text", value: "Explain the answer" } },
      { content: { $case: "data", value: { appCalls: [call] } } },
    ]);
    expect(messageParts("Hello")).toHaveLength(1);
  });

  it("sends the messages that got no answer in the shape the server reads", () => {
    const { unanswered } = contract.request;
    expect(messageParts("continue", { unanswered })).toEqual([
      { content: { $case: "text", value: "continue" } },
      { content: { $case: "data", value: { unanswered } } },
    ]);
  });

  it.each([
    ["a resource that is not ui://", { resourceUri: "https://elsewhere/app" }],
    ["no tool", { toolName: undefined }],
    ["arguments that are not an object", { toolInput: "arguments" }],
    ["no result", { toolResult: undefined }],
    ["a result with no content", { toolResult: { structuredContent: {} } }],
  ])("drops %s, which is not a tool result with UI", (_, change) => {
    const [card] = contract.reply.cards;
    expect(
      agentData(replyOf({ cards: [{ ...card, ...change }] })).cards,
    ).toEqual([]);
  });

  it("keeps the answer when the data part is malformed", () => {
    expect(agentData(replyOf({ actions: "open", cards: [{}] }))).toEqual({
      followUps: [],
      actions: [],
      cards: [],
    });
  });
});
