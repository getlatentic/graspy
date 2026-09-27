export const VOICE_PAGE = "/app/learn/voice";

const HOME = "/app/learn";

/** Where the voice lessons are: Home for a class that learns by voice alone, their own page
 * for a class that also learns from slides. */
export const voiceLessonsPath = (voiceOnly: boolean) =>
  voiceOnly ? HOME : VOICE_PAGE;

/** A lesson the learner chose, or the one the teacher gives next. */
export const voiceLessonPath = (plan?: string) =>
  plan
    ? `${VOICE_PAGE}/lesson?plan=${encodeURIComponent(plan)}`
    : `${VOICE_PAGE}/lesson`;
