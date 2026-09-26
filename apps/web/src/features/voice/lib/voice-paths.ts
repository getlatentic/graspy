export const VOICE_PAGE = "/app/learn/voice";

/** A lesson the learner chose, or the one the teacher gives next. */
export const voiceLessonPath = (plan?: string) =>
  plan
    ? `${VOICE_PAGE}/lesson?plan=${encodeURIComponent(plan)}`
    : `${VOICE_PAGE}/lesson`;
