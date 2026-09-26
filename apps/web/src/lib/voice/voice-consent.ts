// The note a learner sees once, before their first voice lesson.
const SEEN_PREFIX = "graspy.voice.note-seen.";

export function voiceNoteSeen(learner: string): boolean {
  try {
    return window.localStorage.getItem(SEEN_PREFIX + learner) !== null;
  } catch {
    return false;
  }
}

export function markVoiceNoteSeen(learner: string): void {
  try {
    window.localStorage.setItem(SEEN_PREFIX + learner, String(Date.now()));
  } catch {
    // Storage refused: the note shows again next time, which asks nothing more of anyone.
  }
}
