import { afterEach, describe, expect, it, vi } from "vitest";

class FakeAudio {
  src = "";
  play = vi.fn(async () => undefined);
  canPlayType = () => "probably";
}

class FakeContext {
  resume = vi.fn(async () => undefined);
}

afterEach(() => vi.unstubAllGlobals());

describe("TeacherVoice.unlock", () => {
  it("plays its silence from a blob, which the page's policy allows", async () => {
    const played: FakeAudio[] = [];
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        constructor() {
          super();
          played.push(this);
        }
      },
    );
    vi.stubGlobal("AudioContext", FakeContext);
    const { TeacherVoice } = await import("./teacher-voice");

    new TeacherVoice().unlock();

    const [element] = played;
    expect(element.src).toMatch(/^blob:/);
    expect(element.play).toHaveBeenCalled();
    const silence = await (await fetch(element.src)).arrayBuffer();
    expect(new TextDecoder().decode(silence.slice(0, 4))).toBe("RIFF");
  });
});

describe("the app's own sounds while she speaks", () => {
  it("keep quiet from the line playing until it ends or she is stopped", async () => {
    const element = {
      src: "",
      onended: null as null | (() => void),
      onerror: null,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      canPlayType: () => "probably",
    };
    vi.stubGlobal("Audio", function () {
      return element;
    });
    vi.stubGlobal("AudioContext", FakeContext);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:line");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
    const { TeacherVoice } = await import("./teacher-voice");
    const { isQuiet } = await import("./quiet");
    const voice = new TeacherVoice();
    const line = async () => new Blob(["x"], { type: "audio/wav" });

    const heard = voice.say(line);
    await vi.waitFor(() => expect(isQuiet()).toBe(true));
    element.onended?.();
    expect(await heard).toBe("heard");
    expect(isQuiet()).toBe(false);

    const cut = voice.say(line);
    await vi.waitFor(() => expect(isQuiet()).toBe(true));
    voice.stop();
    expect(await cut).toBe("heard");
    expect(isQuiet()).toBe(false);
  });

  it("do not stay held when a second line arrives while the first is still being fetched", async () => {
    const element = {
      src: "",
      onended: null as null | (() => void),
      onerror: null,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      canPlayType: () => "probably",
    };
    vi.stubGlobal("Audio", function () {
      return element;
    });
    vi.stubGlobal("AudioContext", FakeContext);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:line");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
    const { TeacherVoice } = await import("./teacher-voice");
    const { isQuiet } = await import("./quiet");
    const voice = new TeacherVoice();
    const blob = new Blob(["x"], { type: "audio/wav" });
    let arrive: () => void = () => undefined;
    const slow = () =>
      new Promise<Blob>((resolve) => (arrive = () => resolve(blob)));

    const first = voice.say(slow);
    const firstArrives = arrive;
    const second = voice.say(slow);
    firstArrives();
    arrive();
    await vi.waitFor(() => expect(isQuiet()).toBe(true));
    element.onended?.();
    await first;
    await second;
    expect(isQuiet()).toBe(false);
  });
});
