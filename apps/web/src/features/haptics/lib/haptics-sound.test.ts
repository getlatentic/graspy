// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAudio, fakeFetch, settle } from "./audio.fake";
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
  it("make no audio context and fetch nothing until the first gesture, then play the select sound on a tap", async () => {
    await load();
    expect(audio.contexts).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    await tap(button());
    expect(audio.contexts).toHaveLength(1);
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

  it("keep to the rate cap, so quick taps sound once", async () => {
    await load();
    const go = button();
    await tap(go);
    go.click();
    go.click();
    expect(heard()).toBe(1);
  });

  it("do not tick for focus or the remote's arrow keys", async () => {
    await load();
    document.body.innerHTML = "<button>One</button><button>Two</button>";
    const [one, two] = Array.from(document.querySelectorAll("button"));
    one.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    one.focus();
    two.focus();
    two.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(audio.contexts).toHaveLength(1);
    expect(heard()).toBe(0);
  });
});
