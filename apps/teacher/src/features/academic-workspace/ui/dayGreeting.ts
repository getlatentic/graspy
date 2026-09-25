/**
 * How the app greets a teacher at the hour they opened it.
 *
 * Nameless: the app has no account yet, so a greeting that used a name would be
 * inventing one. The boundaries are the ordinary ones — noon turns the morning
 * over, and five o'clock ends the school afternoon.
 */
export function dayGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
