import { afterEach, describe, expect, it, vi } from "vitest";
import { detectLocale } from "./locale-detector";

function browser(languages: string[], timeZone: string) {
  vi.stubGlobal("navigator", { language: languages[0], languages });
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    ...new Intl.DateTimeFormat().resolvedOptions(),
    timeZone,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectLocale", () => {
  it("takes the country a language is spoken in over the time zone", () => {
    browser(["sk-SK", "en-US"], "Europe/London");
    expect(detectLocale()).toEqual({ language: "sk", country: "SK" });
  });

  it("takes a regional variant that names its country", () => {
    browser(["ar-PS"], "UTC");
    expect(detectLocale()).toEqual({ language: "ar", country: "PS" });
  });

  it("takes the time zone's country for a widely spoken language", () => {
    browser(["en-US"], "Africa/Lagos");
    expect(detectLocale()).toEqual({ language: "en", country: "NG" });
  });

  it("names Gaza's time zone Palestine", () => {
    browser(["en"], "Asia/Gaza");
    expect(detectLocale().country).toBe("PS");
  });

  it("falls back to the region of the first language tag", () => {
    browser(["en-GB", "fr-CA"], "UTC");
    expect(detectLocale().country).toBe("GB");
  });

  it("finds no country without a signal", () => {
    browser(["en", "fr"], "UTC");
    expect(detectLocale()).toEqual({ language: "en", country: null });
  });
});
