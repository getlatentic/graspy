import { describe, expect, it } from "vitest";
import {
  languagePairOf,
  lessonLanguageOf,
  voiceClassOf,
} from "./voice-learner";

describe("voiceClassOf", () => {
  it("names a Nigerian primary class as the voice curriculum keys it", () => {
    expect(voiceClassOf({ system: "NG", level: "primary-4" })).toBe(
      "primary_4",
    );
  });

  it("has no voice lessons past primary school", () => {
    expect(voiceClassOf({ system: "NG", level: "jss-1" })).toBeNull();
    expect(voiceClassOf({ system: "NG", level: "sss-2" })).toBeNull();
  });

  it("has no voice lessons outside Nigeria's system", () => {
    expect(voiceClassOf({ system: "GH", level: "primary-4" })).toBeNull();
    expect(voiceClassOf({})).toBeNull();
  });
});

describe("the lesson language", () => {
  it("is the learner's when the teacher speaks it, and English otherwise", () => {
    expect(lessonLanguageOf("yo")).toBe("yo");
    expect(lessonLanguageOf("pcm")).toBe("pcm");
    expect(lessonLanguageOf("ar")).toBe("en");
    expect(lessonLanguageOf("ha")).toBe("en");
  });

  it("files Yoruba answers as Yoruba-English and the rest as Pidgin-English", () => {
    expect(languagePairOf("yo")).toBe("yo-en");
    expect(languagePairOf("en")).toBe("pcm-en");
    expect(languagePairOf("pcm")).toBe("pcm-en");
  });
});
