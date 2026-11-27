import { redirect, type RouteObject } from "react-router";
import { ASK_HUB } from "@/features/learn/lib/chat-targets";

/** The short links to the chat. There is one chat, under /app/learn/ask; both addresses lead
 * to it, for a visitor and for an account alike. */
export const CHAT_LINKS = ["/chat", "/app/chat"] as const;

export const chatLinks: RouteObject[] = CHAT_LINKS.map((path) => ({
  path,
  loader: () => redirect(ASK_HUB),
}));
