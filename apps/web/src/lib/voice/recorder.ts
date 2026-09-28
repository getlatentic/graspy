import type { EndpointState } from "./speech-endpoint";
import { TakeCollector } from "./take-collector";

const WORKLET = "/worklets/pcm-capture.js";
/** Longer than any answer; a take left open ends itself. */
const LONGEST_TAKE_MS = 110_000;

export type TakeResult =
  { kind: "answer"; wav: Blob } | { kind: "nothing" } | { kind: "cancelled" };

export interface Take {
  /**
   * Settles once: when the child stops speaking, the take is stopped or cancelled. A take still open
   * when the page is hidden or left is cancelled: whoever speaks then is never the child's answer.
   */
  done: Promise<TakeResult>;
  stop(): void;
  cancel(): void;
}

async function openMicrophone(): Promise<{
  stream: MediaStream;
  context: AudioContext;
  node: AudioWorkletNode;
}> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const context = new AudioContext();
  try {
    await context.audioWorklet.addModule(WORKLET);
    const node = new AudioWorkletNode(context, "pcm-capture");
    context.createMediaStreamSource(stream).connect(node);
    return { stream, context, node };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
    throw error;
  }
}

/** Records one spoken answer as 16 kHz mono 16-bit WAV, ending where the child stops. */
export async function startTake(
  onLevel: (level: number) => void,
): Promise<Take> {
  const { stream, context, node } = await openMicrophone();
  let settle: (result: TakeResult) => void = () => {};
  const done = new Promise<TakeResult>((resolve) => (settle = resolve));
  let open = true;

  const close = (result: () => TakeResult) => {
    if (!open) return;
    open = false;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", cancelWhenHidden);
    window.removeEventListener("pagehide", cancel);
    node.port.onmessage = null;
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
    settle(result());
  };
  const finish = () =>
    close(() =>
      collector.audible
        ? { kind: "answer", wav: collector.wav() }
        : { kind: "nothing" },
    );
  const collector = new TakeCollector(
    context.sampleRate,
    (level, state: EndpointState) => {
      onLevel(level);
      if (state === "finished") finish();
      if (state === "nothing") close(() => ({ kind: "nothing" }));
    },
  );
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    if (open) collector.add(event.data);
  };
  const timer = setTimeout(finish, LONGEST_TAKE_MS);
  const cancel = () => close(() => ({ kind: "cancelled" }));
  const cancelWhenHidden = () => {
    if (document.visibilityState === "hidden") cancel();
  };
  document.addEventListener("visibilitychange", cancelWhenHidden);
  window.addEventListener("pagehide", cancel);
  // The microphone can open after the child switched away while its prompt was showing.
  cancelWhenHidden();

  return { done, stop: finish, cancel };
}
