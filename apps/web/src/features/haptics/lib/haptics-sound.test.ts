// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAudio, fakeFetch, settle } from "./audio.fake";
import { MIN_GAP_MS } from "./haptic-patterns";
import { SOUND_FILES } from "./sound-files";

// Each load of the module listens on the document and window; these are taken off after each test.
const added: [EventTarget, string, EventListenerOrEventListenerObject][] = [];
let audio: ReturnType<typeof fakeAudio>;
let hidden = false;

beforeEach(() => {
  audio = fakeAudio();
  hidden = false;
  vi.stubGlobal("AudioContext", audio.Context);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      arrayBuffer: () => fakeFetch()(url),
    })),
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    value: { hasBeenActive: true },
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
  for (const target of [document, window]) {
    const original = target.addEventListener.bind(target);
    vi.spyOn(target, "addEventListener").mockImplementation(
      (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) => {
        added.push([target, type, listener]);
        original(type, listener, options);
      },
    );
  }
});
afterEach(() => {
  for (const [target, type, listener] of added.splice(0)) {
    target.removeEventListener(type, listener, true);
    target.removeEventListener(type, listener);
  }
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function load() {
  vi.resetModules();
  window.localStorage.clear();
  const { haptics } = await import("./haptics");
  const { installSelectSound } = await import("./select-sound");
  const { holdQuiet } = await import("@/lib/voice/quiet");
  const { setSettings } = await import("./haptic-settings");
  installSelectSound(haptics);
  return { haptics, holdQuiet, setSettings };
}

/** A tap: the gesture that wakes the audio and loads the recordings, then the click. */
async function tap(element: Element) {
  element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  await settle();
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

const heard = () => audio.sources.length;
const heardFiles = () => audio.sources.map((source) => source.buffer?.file);

function button() {
  document.body.innerHTML = "<button>Go</button>";
  return document.body.querySelector("button")!;
}

describe("the sounds", () => {
  it("fetch once the page is idle, make no audio context until the first gesture, and then the first tap is heard", async () => {
    await load();
    expect(fetch).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledTimes(Object.keys(SOUND_FILES).length),
    );
    await settle();
    expect(audio.contexts).toHaveLength(0);
    await tap(button());
    expect(audio.contexts).toHaveLength(1);
    expect(heardFiles()).toEqual([SOUND_FILES.select]);
  });

  it("fetch nothing before the page is idle when the learner has switched Sounds off", async () => {
    await load();
    const { setSettings } = await import("./haptic-settings");
    setSettings({ vibration: true, sound: false });
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cut a cue already sounding when the microphone or the teacher takes a hold", async () => {
    const { haptics, holdQuiet } = await load();
    await tap(button());
    haptics.trigger("lessonComplete");
    const [select, jingle] = audio.sources;
    holdQuiet();
    expect(jingle.stop).toHaveBeenCalledOnce();
    expect(select.stop).toHaveBeenCalledOnce();
  });

  it("wake the audio when a graded answer comes from a lesson's frame, with no gesture on the page", async () => {
    const { haptics } = await load();
    expect(audio.contexts).toHaveLength(0);
    haptics.wake();
    expect(audio.contexts).toHaveLength(1);
    expect(audio.contexts[0].resume).toHaveBeenCalledOnce();
  });

  it("wake a sleeping context when the page returns to the front, and never make one", async () => {
    await load();
    window.dispatchEvent(new Event("focus"));
    expect(audio.contexts).toHaveLength(0);
    await tap(button());
    audio.contexts[0].state = "interrupted";
    window.dispatchEvent(new Event("pageshow"));
    expect(audio.contexts[0].resume).toHaveBeenCalledTimes(2);
    audio.contexts[0].state = "suspended";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(audio.contexts[0].resume).toHaveBeenCalledTimes(3);
  });

  it("fetch again when the network returns", async () => {
    let reachable = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (!reachable) throw new Error("offline");
        return { ok: true, status: 200, arrayBuffer: () => fakeFetch()(url) };
      }),
    );
    await load();
    await tap(button());
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await settle();
    expect(heard()).toBe(0);
    reachable = true;
    window.dispatchEvent(new Event("online"));
    await new Promise((resolve) => setTimeout(resolve, 120));
    await tap(button());
    expect(heardFiles()).toEqual([SOUND_FILES.select]);
  });

  it("play the recording of each cue", async () => {
    const { haptics } = await load();
    await tap(button());
    for (const cue of [
      "lessonComplete",
      "wrong",
      "correct",
      "press",
    ] as const) {
      haptics.stop();
      await new Promise((resolve) => setTimeout(resolve, 120));
      haptics.trigger(cue);
    }
    expect(heardFiles()).toEqual([
      SOUND_FILES.select,
      SOUND_FILES.lessonComplete,
      SOUND_FILES.wrong,
      SOUND_FILES.correct,
      SOUND_FILES.press,
    ]);
  });

  it("stay silent when the recordings cannot be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    await load();
    await tap(button());
    expect(heard()).toBe(0);
  });

  it("are silent while the teacher's voice plays, and return when she stops", async () => {
    const { holdQuiet } = await load();
    const go = button();
    await tap(go);
    const before = heard();
    const stop = holdQuiet();
    await tap(go);
    expect(heard()).toBe(before);
    stop();
    await new Promise((resolve) => setTimeout(resolve, 120));
    await tap(go);
    expect(heard()).toBeGreaterThan(before);
  });

  it("are silent while the microphone is open, however many holds there are", async () => {
    const { holdQuiet } = await load();
    const go = button();
    await tap(go);
    const before = heard();
    const stopVoice = holdQuiet();
    const stopMic = holdQuiet();
    stopVoice();
    await tap(go);
    expect(heard()).toBe(before);
    stopMic();
  });

  it("are silent in a hidden page", async () => {
    await load();
    const go = button();
    await tap(go);
    const before = heard();
    hidden = true;
    await new Promise((resolve) => setTimeout(resolve, 120));
    await tap(go);
    expect(heard()).toBe(before);
  });

  it("are silent once the learner switches Sounds off, and vibration stays on its own switch", async () => {
    const { setSettings } = await load();
    const go = button();
    await tap(go);
    const before = heard();
    setSettings({ vibration: true, sound: false });
    await new Promise((resolve) => setTimeout(resolve, 120));
    await tap(go);
    expect(heard()).toBe(before);
  });

  it("are not silenced by reduced motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
    }));
    await load();
    await tap(button());
    expect(heard()).toBe(1);
  });

  it("keep to the rate cap by the clock, so quick taps sound once and a later one again", async () => {
    const clock = { at: 5000 };
    vi.spyOn(performance, "now").mockImplementation(() => clock.at);
    await load();
    const go = button();
    await tap(go);
    expect(heard()).toBe(1);
    clock.at += MIN_GAP_MS - 1;
    go.click();
    go.click();
    expect(heard()).toBe(1);
    clock.at += 1;
    go.click();
    expect(heard()).toBe(2);
  });

  it("do not sound for focus or the remote's arrow keys, though the keys wake the audio", async () => {
    await load();
    document.body.innerHTML = "<button>One</button><button>Two</button>";
    const [one, two] = Array.from(document.querySelectorAll("button"));
    one.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    await settle();
    expect(audio.contexts).toHaveLength(1);
    expect(audio.contexts[0].decodeAudioData).toHaveBeenCalled();
    one.focus();
    two.focus();
    two.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    await settle();
    expect(heard()).toBe(0);
    two.click();
    expect(heard()).toBe(1);
  });
});
