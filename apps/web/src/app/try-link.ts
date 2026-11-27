import { redirect, type RouteObject } from "react-router";
import { chatPath, TRY_CHAT } from "@/features/learn/lib/chat-targets";
import { readyToChat } from "@/features/learn/lib/start-chat";
import { currentAccount } from "@/lib/account/account-store";
import { rememberChat } from "@/lib/account/chat-return";

const OPEN_CHAT = chatPath({ kind: "general" });
const WHO_IS_LEARNING = "/app/learners";

/** The public link: no onboarding and no sign-in. It readies the device to chat (a plan with no
 * subjects, to which the chat adds what the learner asks for) and opens the one chat, inside the
 * app. An account that has not chosen a learner is asked, and arrives here once it has. */
export async function startTryChat() {
  const account = currentAccount();
  if (account && !account.learner) {
    rememberChat(TRY_CHAT);
    return redirect(WHO_IS_LEARNING);
  }
  return redirect((await readyToChat()) ? OPEN_CHAT : "/app");
}

export const tryRoute: RouteObject = {
  path: TRY_CHAT,
  loader: startTryChat,
};

/** Where the link was before /try was a page of its own: a chat remembered from then still lands. */
export const tryMoved: RouteObject = {
  path: "ask/try",
  loader: () => redirect(TRY_CHAT),
};
