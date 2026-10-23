import { describe, expect, it } from "vitest";
import { chatLink } from "./chat-link";

describe("the chat link", () => {
  it("is /app/chat, and sends the visitor to the conversation /app/learn/ask opens", async () => {
    const loader = chatLink.loader as () => Response;
    const response = loader();

    expect(chatLink.path).toBe("chat");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/app/learn/ask");
  });
});
