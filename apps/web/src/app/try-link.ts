import {
  redirect,
  type LoaderFunctionArgs,
  type RouteObject,
} from "react-router";
import { requireAccount } from "@/app/chat-gate";
import { chatPath, TRY_CHAT } from "@/features/learn/lib/chat-targets";
import { readyToChat } from "@/features/learn/lib/start-chat";
import { currentAccount } from "@/lib/account/account-store";

/** The public link: no onboarding. It opens the chat, after the sign-in the chat needs. */
export const TRY_LINK = "/try";
const OPEN_CHAT = chatPath({ kind: "general" });
const WHO_IS_LEARNING = "/app/learners";

/** A learner signed in goes into the chat with no onboarding; one who is not is sent to sign
 * in, and arrives here once they have. */
export async function startTryChat(args: LoaderFunctionArgs) {
  requireAccount(args);
  const account = currentAccount();
  if (!account?.learner) return redirect(WHO_IS_LEARNING);
  return redirect((await readyToChat()) ? OPEN_CHAT : "/app");
}

export const tryLink: RouteObject = {
  path: TRY_LINK,
  loader: () => redirect(TRY_CHAT),
};

/** A child of the learner pages' routes, which sit under /app/learn. */
export const tryChat: RouteObject = { path: "ask/try", loader: startTryChat };
