import type { Verdict } from "./mark";

/** What Aunty Chioma says when her own line for this answer cannot be used: kind, short, and true for any question. */
export const STEADY_LINES: Record<Verdict, Record<"en" | "yo" | "pcm", string>> = {
  correct: { en: "Well done. We move on now.", yo: "O ṣe dáadáa. A ó lọ síwájú báyìí.", pcm: "You don do well. We go move on now." },
  nearly: { en: "You were close. Try once more.", yo: "O sún mọ́ ọn. A ó tún gbìyànjú.", pcm: "You nearly get am. We go try am again." },
  wrong: { en: "That one was tricky. We learn it together.", yo: "Ó ṣòro díẹ̀. A ó jọ kọ́ ọ́.", pcm: "That one hard small. We go learn am together." },
  unheard: { en: "I did not hear you. Tap and say it again.", yo: "Mi ò gbọ́ ọ. Tẹ̀ ẹ́, kí o sì tún sọ ọ́.", pcm: "I no hear you. Tap and say am again." },
};
