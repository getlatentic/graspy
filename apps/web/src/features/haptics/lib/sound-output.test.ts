import { describe, expect, it, vi } from "vitest";
import { fakeAudio, fakeFetch, settle } from "./audio.fake";
import type { Cue } from "./haptic-patterns";
import {
  DECODE_TIMEOUT_MS,
  MAX_DECODE_ATTEMPTS,
  PENDING_CUE_MS,
  PENDING_TAP_MS,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  SOUND_FILES,
  VOLUME,
} from "./sound-files";
import { createSound } from "./sound-output";

const FILES = Object.keys(SOUND_FILES).length;

function setup(
  audioOptions: Parameters<typeof fakeAudio>[0] = {},
  fetchOptions: Parameters<typeof fakeFetch>[0] = {},
) {
  const audio = fakeAudio(audioOptions);
  const fetchBytes = fakeFetch(fetchOptions);
  const clock = { at: 1000 };
  const on = { sounds: true };
  const sound = createSound({
    makeContext: () => new audio.Context(),
    fetchBytes,
    now: () => clock.at,
    enabled: () => on.sounds,
  });
  return { audio, fetchBytes, sound, clock, on };
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
});

describe("the sound output", () => {
  it("fetches before any gesture but makes no context until one, and one only", async () => {
    const { audio, fetchBytes, sound } = setup();
    sound.prefetch();
    await settle();
    expect(fetchBytes).toHaveBeenCalledTimes(FILES);
    expect(audio.contexts).toHaveLength(0);
    sound.unlock();
    sound.unlock();
    await settle();
    expect(audio.contexts).toHaveLength(1);
  });

  it("decodes each recording once, however many gestures and prefetches", async () => {
    const { audio, fetchBytes, sound } = setup();
    sound.prefetch();
    await settle();
    sound.unlock();
    sound.unlock();
    sound.prefetch();
    await settle();
    sound.unlock();
    await settle();
    expect(audio.contexts[0].decodeAudioData).toHaveBeenCalledTimes(FILES);
    expect(fetchBytes).toHaveBeenCalledTimes(FILES);
  });

  it("has the first tap heard when the bytes came before it", async () => {
    const { audio, sound } = setup();
    sound.prefetch();
    await settle();
    sound.unlock();
    await settle();
    sound.output.play("select");
    expect(audio.sources).toHaveLength(1);
  });

  it("fetches on the gesture too, when nothing prefetched", async () => {
    const { audio, sound } = setup();
    sound.unlock();
    await settle();
    sound.output.play("select");
    expect(audio.sources).toHaveLength(1);
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

  it("plays the first tap's select once its recording is decoded, so the first tap is heard", async () => {
    const { audio, sound } = setup();
    sound.unlock();
    sound.output.play("select");
    expect(audio.sources).toHaveLength(0);
    await settle();
    expect(audio.sources.map((source) => source.buffer)).toEqual([
      { file: SOUND_FILES.select },
    ]);
  });

  it("drops a first tap's select that waited longer than PENDING_TAP_MS", async () => {
    const { audio, sound, clock } = setup();
    sound.unlock();
    sound.output.play("press");
    clock.at += PENDING_TAP_MS + 1;
    await settle();
    expect(audio.sources).toHaveLength(0);
  });

  it("keeps only the latest select, and plays nothing for a recording that is not on its way", async () => {
    const { audio, sound } = setup();
    sound.output.play("select");
    sound.unlock();
    sound.output.play("select");
    sound.output.play("press");
    await settle();
    expect(audio.sources.map((source) => source.buffer)).toEqual([
      { file: SOUND_FILES.press },
    ]);
  });

  it.each(["suspended", "interrupted"])(
    "wakes a context that went %s on the next gesture, and when the page returns",
    async (state) => {
      const { audio, sound } = setup();
      sound.unlock();
      await settle();
      audio.contexts[0].state = state;
      sound.unlock();
      await settle();
      audio.contexts[0].state = state;
      sound.resume();
      expect(audio.contexts[0].resume).toHaveBeenCalledTimes(3);
    },
  );

  it("never creates a context when only asked to resume", () => {
    const { audio, sound } = setup();
    sound.resume();
    expect(audio.contexts).toHaveLength(0);
  });

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

  it("does not ask again for a recording this browser cannot decode", async () => {
    const { fetchBytes, sound, clock } = setup({ undecodable: true });
    for (let gesture = 0; gesture < 5; gesture++) {
      clock.at += RETRY_MAX_MS;
      sound.unlock();
      await settle();
    }
    expect(fetchBytes).toHaveBeenCalledTimes(FILES);
  });
});

describe("a fetch that fails", () => {
  const offline = { missing: Object.values(SOUND_FILES) };

  it("is spent once by a burst of gestures, not once per event", async () => {
    const { fetchBytes, sound } = setup({}, offline);
    for (let event = 0; event < 12; event++) sound.unlock();
    await settle();
    for (let event = 0; event < 12; event++) sound.unlock();
    await settle();
    expect(fetchBytes).toHaveBeenCalledTimes(FILES);
  });

  it("is asked for again after its wait, with no end to the tries, and the wait grows to a limit", async () => {
    const { fetchBytes, sound, clock } = setup({}, offline);
    let tries = 1;
    sound.unlock();
    await settle();
    for (let round = 0; round < 12; round++) {
      clock.at += RETRY_MAX_MS;
      sound.unlock();
      await settle();
      tries += 1;
    }
    expect(fetchBytes).toHaveBeenCalledTimes(FILES * tries);
    const before = fetchBytes.mock.calls.length;
    clock.at += RETRY_BASE_MS;
    sound.unlock();
    await settle();
    expect(fetchBytes.mock.calls.length).toBe(before);
  });

  it("waits out the first failure for RETRY_BASE_MS", async () => {
    const { fetchBytes, sound, clock } = setup({}, offline);
    sound.unlock();
    await settle();
    clock.at += RETRY_BASE_MS - 1;
    sound.unlock();
    await settle();
    expect(fetchBytes).toHaveBeenCalledTimes(FILES);
    clock.at += 1;
    sound.unlock();
    await settle();
    expect(fetchBytes).toHaveBeenCalledTimes(FILES * 2);
  });

  it("is asked for again at once when the network returns, and then plays", async () => {
    const audio = fakeAudio();
    let reachable = false;
    const fetchBytes = fakeFetch();
    const clock = { at: 1000 };
    const sound = createSound({
      makeContext: () => new audio.Context(),
      fetchBytes: async (url) => {
        if (!reachable) throw new Error("offline");
        return fetchBytes(url);
      },
      now: () => clock.at,
      enabled: () => true,
    });
    sound.unlock();
    await settle();
    reachable = true;
    sound.unlock();
    await settle();
    sound.output.play("select");
    expect(audio.sources).toHaveLength(0);
    sound.retry();
    await settle();
    sound.output.play("select");
    expect(audio.sources).toHaveLength(1);
  });
});

describe("where there is no audio", () => {
  it("stays silent, without throwing, and fetches nothing", () => {
    const fetchBytes = fakeFetch();
    const none = createSound({
      makeContext: undefined,
      fetchBytes,
      now: () => 0,
      enabled: () => true,
    });
    expect(none.output.available()).toBe(false);
    expect(() => {
      none.prefetch();
      none.retry();
      none.unlock();
      none.resume();
      none.output.play("correct");
      none.output.stop();
    }).not.toThrow();
    expect(fetchBytes).not.toHaveBeenCalled();
    const broken = createSound({
      makeContext: () => {
        throw new Error("no audio");
      },
      fetchBytes,
      now: () => 0,
      enabled: () => true,
    });
    expect(() => broken.unlock()).not.toThrow();
  });
});

describe("Sounds switched off", () => {
  it("fetches, decodes, creates and wakes nothing, whoever asks, until it is on again", async () => {
    const { audio, fetchBytes, sound, on } = setup();
    on.sounds = false;
    sound.prefetch();
    sound.retry();
    sound.unlock();
    sound.resume();
    await settle();
    expect(fetchBytes).not.toHaveBeenCalled();
    expect(audio.contexts).toHaveLength(0);
    on.sounds = true;
    sound.unlock();
    await settle();
    sound.output.play("select");
    expect(audio.sources).toHaveLength(1);
  });

  it("stops decoding what was already fetched", async () => {
    const { audio, sound, on } = setup();
    sound.unlock();
    on.sounds = false;
    await settle();
    sound.retry();
    sound.unlock();
    await settle();
    const decoded = audio.contexts[0].decodeAudioData.mock.calls.length;
    expect(decoded).toBeLessThan(FILES);
  });
});

describe("a decode that fails", () => {
  it("is tried again after its wait, from the kept bytes, and then plays", async () => {
    const { audio, fetchBytes, sound, clock } = setup({ failFirst: 1 });
    sound.unlock();
    await settle();
    sound.output.play("select");
    expect(audio.sources).toHaveLength(0);
    clock.at += RETRY_BASE_MS;
    sound.unlock();
    await settle();
    sound.output.play("select");
    expect(audio.sources).toHaveLength(1);
    expect(fetchBytes).toHaveBeenCalledTimes(FILES);
  });

  it("spends one try on a burst of gestures", async () => {
    const { audio, sound } = setup({ undecodable: true });
    for (let event = 0; event < 6; event++) sound.unlock();
    await settle();
    for (let event = 0; event < 6; event++) sound.unlock();
    await settle();
    expect(audio.contexts[0].decodeAudioData).toHaveBeenCalledTimes(FILES);
  });

  it("is given up after a few tries", async () => {
    const { audio, sound, clock } = setup({ undecodable: true });
    for (let gesture = 0; gesture < 8; gesture++) {
      clock.at += RETRY_MAX_MS;
      sound.unlock();
      await settle();
    }
    expect(audio.contexts[0].decodeAudioData).toHaveBeenCalledTimes(
      FILES * MAX_DECODE_ATTEMPTS,
    );
  });

  it("counts a decode that hangs as failed, so it cannot stick the cue for ever", async () => {
    vi.useFakeTimers();
    try {
      const { audio, sound, clock } = setup({ hangs: true });
      sound.unlock();
      await vi.advanceTimersByTimeAsync(0);
      expect(audio.contexts[0].decodeAudioData).toHaveBeenCalledTimes(FILES);
      await vi.advanceTimersByTimeAsync(DECODE_TIMEOUT_MS);
      clock.at += RETRY_BASE_MS;
      sound.unlock();
      await vi.advanceTimersByTimeAsync(0);
      expect(audio.contexts[0].decodeAudioData).toHaveBeenCalledTimes(
        FILES * 2,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("an answer cue that comes before the audio is awake", () => {
  async function asleep() {
    const world = setup();
    world.sound.unlock();
    await settle();
    world.audio.contexts[0].state = "interrupted";
    return world;
  }

  it("plays once the context wakes, if it is fresh", async () => {
    const { audio, sound } = await asleep();
    sound.output.play("correct");
    expect(audio.sources).toHaveLength(0);
    sound.resume();
    await settle();
    expect(audio.sources.map((source) => source.buffer)).toEqual([
      { file: SOUND_FILES.correct },
    ]);
  });

  it("plays once its recording is decoded", async () => {
    const { audio, sound } = setup();
    sound.unlock();
    sound.output.play("lessonComplete");
    expect(audio.sources).toHaveLength(0);
    await settle();
    expect(audio.sources).toHaveLength(1);
  });

  it("keeps only the latest, and drops it when stale", async () => {
    const { audio, sound, clock } = await asleep();
    sound.output.play("correct");
    sound.output.play("wrong");
    sound.resume();
    await settle();
    expect(audio.sources.map((source) => source.buffer)).toEqual([
      { file: SOUND_FILES.wrong },
    ]);
    audio.contexts[0].state = "interrupted";
    sound.output.play("correct");
    clock.at += PENDING_CUE_MS + 1;
    sound.resume();
    await settle();
    expect(audio.sources).toHaveLength(1);
  });

  it("does not wait for a select or a press while the context sleeps, which would be late", async () => {
    const { audio, sound } = await asleep();
    sound.output.play("select");
    sound.output.play("press");
    sound.resume();
    await settle();
    expect(audio.sources).toHaveLength(0);
  });

  it("is dropped by a stop, as a quiet hold or a hidden page makes", async () => {
    const { audio, sound } = await asleep();
    sound.output.play("correct");
    sound.output.stop();
    sound.resume();
    await settle();
    expect(audio.sources).toHaveLength(0);
  });
});
