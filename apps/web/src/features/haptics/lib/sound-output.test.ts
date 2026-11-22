import { describe, expect, it } from "vitest";
import { fakeAudio, fakeFetch, settle } from "./audio.fake";
import type { Cue } from "./haptic-patterns";
import { MAX_ATTEMPTS, SOUND_FILES, VOLUME } from "./sound-files";
import { createSound } from "./sound-output";

function setup(
  audioOptions: Parameters<typeof fakeAudio>[0] = {},
  fetchOptions: Parameters<typeof fakeFetch>[0] = {},
) {
  const audio = fakeAudio(audioOptions);
  const fetchBytes = fakeFetch(fetchOptions);
  const sound = createSound(() => new audio.Context(), fetchBytes);
  return { audio, fetchBytes, sound };
}

describe("the sound files", () => {
  it("are versioned files under /sounds, one for each cue", () => {
    expect(Object.keys(SOUND_FILES).sort()).toEqual(
      ["correct", "lessonComplete", "press", "select", "wrong"].sort(),
    );
    for (const path of Object.values(SOUND_FILES)) {
      expect(path).toMatch(/^\/sounds\/[a-z]+-v\d+\.(wav|m4a)$/);
    }
  });

  it("play at a level that is safe for a child", () => {
    expect(VOLUME).toBeLessThanOrEqual(0.5);
  });
});

describe("the sound output", () => {
  it("makes no context and fetches nothing until a gesture, and one context only", async () => {
    const { audio, fetchBytes, sound } = setup();
    expect(audio.contexts).toHaveLength(0);
    expect(fetchBytes).not.toHaveBeenCalled();
    sound.unlock();
    sound.unlock();
    await settle();
    expect(audio.contexts).toHaveLength(1);
    expect(fetchBytes).toHaveBeenCalledTimes(5);
  });

  it("decodes each recording once, however many gestures", async () => {
    const { audio, sound } = setup();
    sound.unlock();
    await settle();
    sound.unlock();
    sound.unlock();
    await settle();
    expect(audio.contexts[0].decodeAudioData).toHaveBeenCalledTimes(5);
  });

  it.each(Object.entries(SOUND_FILES) as [Cue, string][])(
    "plays the %s recording through one gain set to the volume",
    async (cue, file) => {
      const { audio, sound } = setup();
      sound.unlock();
      await settle();
      sound.output.play(cue);
      expect(audio.sources).toHaveLength(1);
      expect(audio.sources[0].buffer).toEqual({ file });
      expect(audio.sources[0].start).toHaveBeenCalledOnce();
      expect(audio.masters).toHaveLength(1);
      expect(audio.masters[0].gain.value).toBe(VOLUME);
    },
  );

  it("drops a cue while the context sleeps, never queueing it to play late", async () => {
    const { audio, sound } = setup();
    sound.unlock();
    await settle();
    audio.contexts[0].state = "interrupted";
    sound.output.play("select");
    expect(audio.sources).toHaveLength(0);
    sound.unlock();
    await settle();
    expect(audio.sources).toHaveLength(0);
  });

  it("drops a cue whose recording is not decoded yet", () => {
    const { audio, sound } = setup();
    sound.unlock();
    sound.output.play("select");
    expect(audio.sources).toHaveLength(0);
  });

  it.each(["suspended", "interrupted"])(
    "wakes a context that went %s on the next gesture",
    async (state) => {
      const { audio, sound } = setup();
      sound.unlock();
      await settle();
      audio.contexts[0].state = state;
      sound.unlock();
      expect(audio.contexts[0].resume).toHaveBeenCalledTimes(2);
    },
  );

  it("lets go of a source when it ends, and stops those still sounding", async () => {
    const { audio, sound } = setup();
    sound.unlock();
    await settle();
    sound.output.play("lessonComplete");
    sound.output.play("correct");
    const [first, second] = audio.sources;
    first.onended?.();
    expect(first.disconnect).toHaveBeenCalled();
    sound.output.stop();
    expect(first.stop).not.toHaveBeenCalled();
    expect(second.stop).toHaveBeenCalledOnce();
  });

  it("stays silent, without throwing, when a recording cannot be fetched", async () => {
    const { audio, sound } = setup({}, { missing: [SOUND_FILES.correct] });
    sound.unlock();
    await settle();
    expect(() => sound.output.play("correct")).not.toThrow();
    expect(audio.sources).toHaveLength(0);
    sound.output.play("wrong");
    expect(audio.sources).toHaveLength(1);
  });

  it("stays silent, without throwing, when a recording cannot be decoded", async () => {
    const { audio, sound } = setup({ undecodable: true });
    sound.unlock();
    await settle();
    for (const cue of Object.keys(SOUND_FILES) as Cue[]) {
      expect(() => sound.output.play(cue)).not.toThrow();
    }
    expect(audio.sources).toHaveLength(0);
  });

  it("asks again after a failure on a later gesture, a few times and no more", async () => {
    const { fetchBytes, sound } = setup({ undecodable: true });
    for (let gesture = 0; gesture < MAX_ATTEMPTS + 3; gesture++) {
      sound.unlock();
      await settle();
    }
    expect(fetchBytes).toHaveBeenCalledTimes(5 * MAX_ATTEMPTS);
  });

  it("stays silent, without throwing, where there is no audio or it fails", () => {
    const none = createSound(undefined, fakeFetch());
    expect(none.output.available()).toBe(false);
    expect(() => {
      none.unlock();
      none.output.play("correct");
      none.output.stop();
    }).not.toThrow();
    const broken = createSound(() => {
      throw new Error("no audio");
    }, fakeFetch());
    expect(() => broken.unlock()).not.toThrow();
  });
});
