import { describe, expect, it, vi } from "vitest";
import type { ChatMessage, NewChatMessage } from "@/lib/chat-db";
import { MessageStore, type MessageStorage } from "./message-store";
import { appCall } from "@/lib/a2a/request-data";

let saved = 0;

function storage(kept: Record<string, ChatMessage[]> = {}): MessageStorage {
  return {
    load: async (threadId) => kept[threadId] ?? [],
    save: async (message: NewChatMessage) => ({
      ...message,
      id: `saved-${++saved}`,
      timestamp: saved,
    }),
    saveMetadata: vi.fn(async () => {}),
  };
}

const said = (threadId: string, content: string): NewChatMessage => ({
  threadId,
  type: "user",
  content,
  sender: "user",
});

describe("MessageStore in memory", () => {
  it("tells only the conversation that changed", async () => {
    const store = new MessageStore(storage());
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe("a", a);
    store.subscribe("b", b);

    const message = await store.addMessage(said("a", "Hi"));
    store.updateMessage(message.id, { content: "Hi there" });

    expect(a).toHaveBeenCalledTimes(2);
    expect(b).not.toHaveBeenCalled();
    expect(store.messagesOf("a").map((m) => m.content)).toEqual(["Hi there"]);
  });

  it("reads an unchanged conversation as the same list", async () => {
    const store = new MessageStore(storage());
    await store.addMessage(said("a", "Hi"));
    const before = store.messagesOf("a");

    await store.addMessage(said("b", "Elsewhere"));

    expect(store.messagesOf("a")).toBe(before);
    expect(store.messagesOf("none")).toBe(store.messagesOf("other"));
  });

  it("swaps a message still being written for the stored one", async () => {
    const store = new MessageStore(storage());
    const temporary = await store.addMessage(said("a", "Writing"), {
      persist: false,
    });
    const stored = { ...temporary, id: "kept", content: "Written" };

    store.replaceMessage(temporary.id, stored);
    store.updateMessage(temporary.id, { content: "late" });

    expect(store.messagesOf("a")).toEqual([stored]);
  });
});

describe("MessageStore with storage", () => {
  it("merges what storage keeps with what is already shown, once", async () => {
    const kept: ChatMessage = {
      ...said("a", "Earlier"),
      id: "old",
      timestamp: 0,
    };
    const keeping = storage({ a: [kept] });
    const load = vi.spyOn(keeping, "load");
    const store = new MessageStore(keeping);
    await store.addMessage(said("a", "Now"));

    await store.loadThread("a");
    await store.loadThread("a");

    expect(store.messagesOf("a").map((m) => m.content)).toEqual([
      "Earlier",
      "Now",
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps view calls with the message, on screen and in storage", async () => {
    const keeping = storage();
    const store = new MessageStore(keeping);
    const message = await store.addMessage({
      ...said("a", "Card"),
      metadata: { followUps: ["q"] },
    });

    const viewCalls = [appCall("answer_practice", { chosenIndex: 2 })];
    store.keepViewCalls(message.id, viewCalls);

    const merged = { followUps: ["q"], viewCalls };
    expect(store.messagesOf("a")[0].metadata).toEqual(merged);
    expect(keeping.saveMetadata).toHaveBeenCalledWith(
      message.id,
      merged,
      expect.any(Number),
    );
  });

  it("shows another device's messages once taken in, in order, keeping what changed here", async () => {
    const card: ChatMessage = {
      ...said("a", "Card"),
      id: "card",
      timestamp: 20,
      sender: "ai",
    };
    const kept: Record<string, ChatMessage[]> = { a: [card] };
    const store = new MessageStore(storage(kept));
    await store.loadThread("a");
    store.keepViewCalls("card", [
      appCall("answer_practice", { chosenIndex: 1 }),
    ]);
    const failure = await store.addMessage(
      { ...said("a", "Failed"), type: "error", sender: "ai" },
      { persist: false },
    );
    kept.a = [
      { ...said("a", "From the phone"), id: "m-2", timestamp: 10 },
      { ...said("a", "Also"), id: "m-1", timestamp: 10 },
      { ...card, metadata: { followUps: ["older"] } },
    ];

    await store.refreshThread("a");

    const shown = store.messagesOf("a");
    expect(shown.map((m) => m.id)).toEqual(["m-1", "m-2", "card", failure.id]);
    expect(shown[2].metadata?.viewCalls).toHaveLength(1);
  });

  it("reads again only a conversation already shown", async () => {
    const keeping = storage();
    const load = vi.spyOn(keeping, "load");

    await new MessageStore(keeping).refreshThread("never-opened");

    expect(load).not.toHaveBeenCalled();
  });

  it("counts a conversation as read once loading settles, even on failure", async () => {
    const failing: MessageStorage = {
      ...storage(),
      load: async () => {
        throw new Error("storage refused");
      },
    };
    const store = new MessageStore(failing);
    const reading = store.loadThread("t1");
    expect(store.isRead("t1")).toBe(false);

    await expect(reading).rejects.toThrow("storage refused");
    expect(store.isRead("t1")).toBe(true);
    expect(store.messagesOf("t1")).toEqual([]);
  });
});
