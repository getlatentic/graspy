import { schoolSystems } from "./education-api";
import { schoolDescriptor } from "./learner-level";
import { getUserProfile, saveUserProfile } from "./user-storage";

/** Places an earlier version's school year on the country's class for that year. */
export async function placeEarlierClass(): Promise<boolean> {
  const profile = getUserProfile();
  if (!profile?.earlierYear || profile.level) return false;
  const [main] = await schoolSystems(profile.country);
  const level = main?.levels.find((l) => l.year === profile.earlierYear);
  if (!main || !level) return false;
  saveUserProfile({
    system: main.id,
    level: level.id,
    levelNames: level.name,
    gradeLevel: schoolDescriptor(main, level),
    earlierYear: undefined,
  });
  return true;
}
