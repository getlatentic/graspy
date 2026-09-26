import { describe, expect, it } from "vitest";
import { audioFormatFor } from "./audio-format";

describe("audioFormatFor", () => {
  it("asks for Ogg Opus where the browser plays it", () => {
    expect(audioFormatFor(() => "probably")).toBe("ogg");
    expect(audioFormatFor(() => "maybe")).toBe("ogg");
  });

  it("asks for MP3 where the browser cannot play Opus", () => {
    expect(audioFormatFor(() => "")).toBe("mp3");
  });
});
