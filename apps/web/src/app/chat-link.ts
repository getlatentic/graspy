import { redirect, type RouteObject } from "react-router";
import { ASK_HUB } from "@/features/learn/lib/chat-targets";

/** /app/chat is a link to the learner's chat: it opens the conversation /app/learn/ask opens. */
export const chatLink: RouteObject = { path: "chat", loader: () => redirect(ASK_HUB) };
