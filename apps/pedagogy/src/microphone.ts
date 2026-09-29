import type { Page } from "playwright-core";

/**
 * Runs in the page before the app: getUserMedia answers with a stream fed from an audio graph,
 * and `window.__child.say` plays a recording into it. Silence flows the rest of the time, so the
 * app's own microphone code, its endpointing and its upload run exactly as with a child.
 */
export const MICROPHONE_SCRIPT = `
(() => {
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  const silence = context.createConstantSource();
  silence.offset.value = 0;
  silence.connect(destination);
  silence.start();

  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) =>
    constraints && constraints.audio ? destination.stream.clone() : original(constraints);

  window.__child = {
    async say(base64) {
      await context.resume();
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const buffer = await context.decodeAudioData(bytes.buffer);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      const finished = new Promise((resolve) => (source.onended = resolve));
      source.start();
      await finished;
      return buffer.duration;
    },
  };
})();`;

export async function sayIntoMicrophone(page: Page, wav: Buffer): Promise<number> {
  return page.evaluate(
    (base64) => (window as unknown as { __child: { say(b: string): Promise<number> } }).__child.say(base64),
    wav.toString("base64"),
  );
}
