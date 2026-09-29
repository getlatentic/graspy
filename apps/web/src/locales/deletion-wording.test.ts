import { describe, expect, it } from "vitest";
import en from "./en.json";

// What graspy says it deletes must be what it deletes: the recording, once its turn has ended,
// not "as soon as", and not the words it heard, which stay.
describe("what the app says graspy deletes", () => {
  it("says the recording is deleted once the answer is marked, and that the words stay", () => {
    expect(en.voiceRecordings.off).toBe(
      "graspy deletes each recording once it has marked the answer. The words it heard stay.",
    );
  });

  it("says the same in the voice lesson note, unless a parent keeps it", () => {
    expect(en.voice.note).toBe(
      "graspy sends your voice to check your answers. Once marked, the recording is deleted, unless a parent keeps it.",
    );
  });

  it("does not say it happens as soon as, or that everything is deleted", () => {
    const said = [en.voiceRecordings.off, en.voice.note].join(" ");

    expect(said).not.toMatch(/as soon as/i);
    expect(said).not.toMatch(/everything/i);
  });
});
