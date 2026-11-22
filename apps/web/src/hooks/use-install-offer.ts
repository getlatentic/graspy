import { useSyncExternalStore } from "react";
import {
  installOffer,
  subscribeToInstall,
  type InstallOffer,
} from "@/lib/install";

export function useInstallOffer(): InstallOffer {
  return useSyncExternalStore(subscribeToInstall, installOffer, () => null);
}
