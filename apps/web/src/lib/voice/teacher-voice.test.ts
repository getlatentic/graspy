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
