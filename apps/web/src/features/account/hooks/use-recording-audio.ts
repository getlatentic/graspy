import { useEffect, useState } from "react";
import { refusalCode } from "@/lib/account/account-call";
import { recordingAudio } from "@/lib/account/voice-recordings-api";

export type Hearing =
  | { state: "loading" }
  | { state: "ready"; url: string }
  | { state: "gone" }
  | { state: "failed" };

/** A kept recording, fetched with the session in use as a blob and given an object URL, which
 * is revoked once the recording is no longer shown. */
export function useRecordingAudio(learner: string, recording: string): Hearing {
  const [heard, setHeard] = useState<{ recording: string; hearing: Hearing }>();

  useEffect(() => {
    let current = true;
    let url: string | null = null;
    const settle = (hearing: Hearing) => {
      if (current) setHeard({ recording, hearing });
    };
    recordingAudio(learner, recording)
      .then((audio) => {
        if (!current) return;
        url = URL.createObjectURL(audio);
        settle({ state: "ready", url });
      })
      .catch((error: unknown) => {
        console.warn("Fetching the recording failed:", error);
        settle({
          state: refusalCode(error) === "recording_gone" ? "gone" : "failed",
        });
      });
    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [learner, recording]);

  return heard?.recording === recording ? heard.hearing : { state: "loading" };
}
