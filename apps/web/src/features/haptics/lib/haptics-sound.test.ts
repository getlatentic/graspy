// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAudio } from "./audio.fake";

// Each load of the module listens on the document and window; these are taken off after each test.
const added: [EventTarget, string, EventListenerOrEventListenerObject][] = [];
let audio: ReturnType<typeof fakeAudio>;
let hidden = false;

beforeEach(() => {
  audio = fakeAudio();
  hidden = false;
  vi.stubGlobal("AudioContext", audio.Context);
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

/** A tap: the gesture that wakes the audio, then the click. */
async function tap(element: Element) {
  element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  await Promise.resolve();
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

const heard = () => audio.oscillators.length;

function button() {
  document.body.innerHTML = "<button>Go</button>";
  return document.body.querySelector("button")!;
}

describe("the sounds", () => {
  it("make no audio context until the first gesture, then tick on a tap", async () => {
    await load();
    expect(audio.contexts).toHaveLength(0);
    await tap(button());
    expect(audio.contexts).toHaveLength(1);
    expect(heard()).toBe(1);
    expect(audio.oscillators[0].frequency.value).toBe(1200);
  });

  it("play a cue's notes", async () => {
    const { haptics } = await load();
    await tap(button());
    haptics.trigger("lessonComplete");
    expect(audio.oscillators.map((note) => note.frequency.value)).toEqual([
      1200, 523, 659, 784,
    ]);
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

  it("keep to the rate cap, so quick taps tick once", async () => {
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
