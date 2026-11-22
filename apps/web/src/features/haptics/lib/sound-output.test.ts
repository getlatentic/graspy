import { describe, expect, it } from "vitest";
import { fakeAudio } from "./audio.fake";
import { createSound } from "./sound-output";
import { MAX_TONE_S, PEAK_GAIN, TONES } from "./sound-tones";

function setup() {
  const audio = fakeAudio();
  const sound = createSound(() => new audio.Context());
  return { audio, sound };
}

describe("the tones", () => {
  it("are short, soft, and a wrong answer is lower and falling", () => {
    for (const notes of Object.values(TONES)) {
      const last = notes.at(-1)!;
      expect(last.at + last.length).toBeLessThanOrEqual(MAX_TONE_S);
    }
    expect(PEAK_GAIN).toBeLessThanOrEqual(0.15);
    const [right, wrong] = [TONES.correct, TONES.wrong];
    expect(right[1].hz).toBeGreaterThan(right[0].hz);
    expect(wrong[1].hz).toBeLessThan(wrong[0].hz);
    expect(Math.max(...wrong.map((n) => n.hz))).toBeLessThan(right[0].hz);
    expect(TONES.press[0].length).toBeLessThanOrEqual(0.03);
    expect(TONES.lessonComplete).toHaveLength(3);
  });
});

describe("the sound output", () => {
  it("makes no context until a gesture, and one only", () => {
    const { audio, sound } = setup();
    expect(audio.contexts).toHaveLength(0);
    sound.unlock();
    sound.unlock();
    expect(audio.contexts).toHaveLength(1);
  });

  it("plays a cue's notes with a short soft envelope once awake", async () => {
    const { audio, sound } = setup();
    sound.unlock();
    await Promise.resolve();
    sound.output.play("correct");
    expect(audio.oscillators.map((note) => note.frequency.value)).toEqual([
      660, 880,
    ]);
    expect(audio.gains.every((level) => level.gain.peak === PEAK_GAIN)).toBe(
      true,
    );
    expect(audio.gains[0].gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 10);
    expect(audio.oscillators[1].start).toHaveBeenCalledWith(10.075);
  });

  it("drops a cue while the context sleeps, never queueing it to play late", () => {
    const { audio, sound } = setup();
    sound.output.play("press");
    sound.unlock();
    expect(audio.contexts[0].state).toBe("suspended");
    sound.output.play("press");
    expect(audio.oscillators).toHaveLength(0);
    expect(audio.contexts[0].resume).toHaveBeenCalledOnce();
  });

  it.each(["suspended", "interrupted"])(
    "wakes a context that went %s on the next gesture",
    async (state) => {
      const { audio, sound } = setup();
      sound.unlock();
      await Promise.resolve();
      audio.contexts[0].state = state;
      sound.unlock();
      expect(audio.contexts[0].resume).toHaveBeenCalledTimes(2);
    },
  );

  it("lets go of each note when it ends, and stops those still sounding", async () => {
    const { audio, sound } = setup();
    sound.unlock();
    await Promise.resolve();
    sound.output.play("lessonComplete");
    const [first, ...rest] = audio.oscillators;
    first.onended?.();
    expect(first.disconnect).toHaveBeenCalled();
    expect(audio.gains[0].disconnect).toHaveBeenCalled();
    sound.output.stop();
    expect(first.stop).toHaveBeenCalledTimes(1);
    for (const note of rest) expect(note.stop).toHaveBeenCalledTimes(2);
  });

  it("stays silent, without throwing, where there is no audio or it fails", () => {
    const none = createSound(undefined);
    expect(none.output.available()).toBe(false);
    expect(() => {
      none.unlock();
      none.output.play("correct");
      none.output.stop();
    }).not.toThrow();
    const broken = createSound(() => {
      throw new Error("no audio");
    });
    expect(() => broken.unlock()).not.toThrow();
  });
});
