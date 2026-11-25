import { redirect, type RouteObject } from "react-router";
import { chatPath, TRY_CHAT } from "@/features/learn/lib/chat-targets";
import { readyToChat } from "@/features/learn/lib/start-chat";
import { currentAccount } from "@/lib/account/account-store";
import { rememberChat } from "@/lib/account/chat-return";

const OPEN_CHAT = chatPath({ kind: "general" });
const WHO_IS_LEARNING = "/app/learners";

/** The public link: no onboarding and no sign-in. A visitor with no account stays on the page,
 * which is a text-only chat that keeps nothing of them on the server (try-page.tsx). A learner
 * signed in goes into their own chat; an account that has not chosen a learner is asked, and
 * arrives here once it has. */
export async function startTryChat() {
  const account = currentAccount();
  if (!account) return null;
  if (!account.learner) {
    rememberChat(TRY_CHAT);
    return redirect(WHO_IS_LEARNING);
  }
  return redirect((await readyToChat()) ? OPEN_CHAT : "/app");
}

export const tryRoute: RouteObject = {
  path: TRY_CHAT,
  loader: startTryChat,
  lazy: async () => ({
    Component: (await import("@/app/try-page")).default,
  }),
};
