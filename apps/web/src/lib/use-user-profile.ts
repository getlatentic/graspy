import { useSyncExternalStore } from "react";
import {
  getUserProfile,
  onProfileSaved,
  type UserProfile,
} from "./user-storage";

let kept: { saved: number; profile: UserProfile | null } | null = null;
let saves = 0;

onProfileSaved(() => {
  saves += 1;
});

/** React requires the same object until the next save. */
function snapshot(): UserProfile | null {
  if (kept?.saved !== saves) kept = { saved: saves, profile: getUserProfile() };
  return kept.profile;
}

export function useUserProfile(): UserProfile | null {
  return useSyncExternalStore(onProfileSaved, snapshot);
}
