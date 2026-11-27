import { currentAccount } from "@/lib/account/account-store";
import {
  fetchWithTokens,
  getSessionToken,
  refreshSessionToken,
  type Tokens,
} from "./session";
import { getVisitorToken, refreshVisitorToken } from "./visitor-session";

// The chat is the one thing a visitor with no account may use under a session of their own. Who it
// is asked for is read when each request is made, so a visitor who signs in mid-chat carries on
// under their account. Lessons, plans and everything else go under the device's session.

export const chatTokens: Tokens = {
  get: () => (currentAccount() ? getSessionToken() : getVisitorToken()),
  refresh: () =>
    currentAccount() ? refreshSessionToken() : refreshVisitorToken(),
};

/** Sent with the session the chat runs under. */
export const fetchForChat = (
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> => fetchWithTokens(chatTokens, input, init);
