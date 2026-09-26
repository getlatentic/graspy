/** How long a line is waited for before the lesson goes on with her words alone. */
const LONGEST_WAIT_MS = 45_000;
// A twentieth of a second of silence, played on the tap that starts a lesson: Safari lets a page
// play sound only after one it played inside a gesture.
const SILENCE = `data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA`;

export type Spoken = "heard" | "failed";

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The line took too long")),
      ms,
    );
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * The teacher's voice, in the format the browser plays (audio-format.ts). An audio element
 * plays it; where that fails, Web Audio decodes it; where neither can, the line is reported
 * failed and the lesson goes on with her words on screen.
 */
export class TeacherVoice {
  private readonly element = new Audio();
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private finish: ((spoken: Spoken) => void) | null = null;

  /** Called inside the tap that starts the lesson. */
  unlock(): void {
    this.element.src = SILENCE;
    void this.element.play().catch(() => undefined);
    this.context ??= new AudioContext();
    void this.context.resume().catch(() => undefined);
  }

  /** Says one line; settles when she finishes, is stopped, or cannot say it. */
  async say(line: () => Promise<Blob>): Promise<Spoken> {
    this.stop();
    let audio: Blob;
    try {
      audio = await withTimeout(line(), LONGEST_WAIT_MS);
    } catch (error) {
      console.warn("The teacher's line did not arrive:", error);
      return "failed";
    }
    return new Promise<Spoken>((resolve) => {
      this.finish = resolve;
      const playable = this.element.canPlayType(audio.type || "audio/ogg");
      if (playable) this.playElement(audio);
      else void this.playDecoded(audio);
    });
  }

  private settle(spoken: Spoken): void {
    const finish = this.finish;
    this.finish = null;
    finish?.(spoken);
  }

  private playElement(audio: Blob): void {
    const url = URL.createObjectURL(audio);
    const element = this.element;
    element.onended = () => {
      URL.revokeObjectURL(url);
      this.settle("heard");
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      void this.playDecoded(audio);
    };
    element.src = url;
    element.play().catch(() => {
      element.onerror = null;
      URL.revokeObjectURL(url);
      void this.playDecoded(audio);
    });
  }

  private async playDecoded(audio: Blob): Promise<void> {
    try {
      this.context ??= new AudioContext();
      const buffer = await this.context.decodeAudioData(
        await audio.arrayBuffer(),
      );
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);
      source.onended = () => this.settle("heard");
      this.source = source;
      source.start();
    } catch (error) {
      console.warn("The teacher's line would not play:", error);
      this.settle("failed");
    }
  }

  /** She stops mid-sentence; a line cut short counts as heard. */
  stop(): void {
    this.element.onended = null;
    this.element.onerror = null;
    this.element.pause();
    if (this.source) {
      this.source.onended = null;
      this.source.stop();
      this.source = null;
    }
    this.settle("heard");
  }

  close(): void {
    this.stop();
    void this.context?.close();
    this.context = null;
  }
}
