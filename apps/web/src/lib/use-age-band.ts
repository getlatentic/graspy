import { ageBand, type AgeBand } from "@/lib/age-band";
import { useUserProfile } from "@/lib/use-user-profile";

/** The signed-in learner's band; child before a profile exists. */
export function useAgeBand(): AgeBand {
  const profile = useUserProfile();
  return profile ? ageBand(profile) : "child";
}
