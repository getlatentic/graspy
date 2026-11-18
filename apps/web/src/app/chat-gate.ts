import { redirect, type LoaderFunctionArgs } from "react-router";
import { SIGN_IN_PAGE } from "@/features/account/components/sign-in-link";
import { currentAccount } from "@/lib/account/account-store";
import { rememberChat } from "@/lib/account/chat-return";

/** The chat is for a signed-in account's learner. A visitor who is not signed in is sent to
 * sign in, and one with no learner chosen to choose (the learner pages do that); either way
 * the chat asked for is kept, and is where they arrive. */
export function requireAccount({ request }: LoaderFunctionArgs): null {
  const { pathname, search } = new URL(request.url);
  const account = currentAccount();
  if (account?.learner) return null;
  rememberChat(`${pathname}${search}`);
  if (!account) throw redirect(SIGN_IN_PAGE);
  return null;
}
