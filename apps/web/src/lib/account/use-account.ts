import { useSyncExternalStore } from "react";
import { currentAccount, onAccountChange, type Account } from "./account-store";

export function useAccount(): Account | null {
  return useSyncExternalStore(onAccountChange, currentAccount);
}
