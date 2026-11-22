import { describe, expect, it } from "vitest";
import { isTelevision } from "./device";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
};

const DESKTOP = "Mozilla/5.0 (Macintosh) Chrome/130";
const TVS = [
  "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36",
  "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/79.0 Safari/537.36 WebAppManager",
  "Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233) AppleWebKit/537.36 Chrome/98 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 12; BRAVIA 4K VH2) AppleWebKit/537.36 Chrome/108",
  "Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 Chrome/76 Safari/537.36 CrKey/1.56.500000",
  "Roku/DVP-9.10 (519.10E04111A)",
  "Mozilla/5.0 (Linux; Android 9; Hisense VIDAA) AppleWebKit/537.36",
  "Opera/9.80 (Linux mips; U; HbbTV/1.1.1 (; Philips; ; ; ; ) CE-HTML/1.0 NETTV/4.0.2; en) Presto/2.6.33",
];
const NOT_TVS = [
  DESKTOP,
  "Mozilla/5.0 (Linux; Android 9; PHILIPS TLE) AppleWebKit/537.36 Chrome/100 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 11; Hisense E50) AppleWebKit/537.36 Chrome/100 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 10; KFTRWI) AppleWebKit/537.36 Silk/100 like Chrome",
];

describe("isTelevision", () => {
  it("knows a TV by its agent, and not a tablet or phone of the same brand", () => {
    for (const agent of TVS) {
      expect(isTelevision(agent, "", memory()), agent).toBe(true);
    }
    for (const agent of NOT_TVS) {
      expect(isTelevision(agent, "", memory()), agent).toBe(false);
    }
  });

  it("is forced on by ?tv=1, which is kept", () => {
    const store = memory();
    expect(isTelevision(DESKTOP, "?tv=1", store)).toBe(true);
    expect(isTelevision(DESKTOP, "", store)).toBe(true);
  });

  it("is forced off by ?tv=0 even on a real TV agent, which is kept, until ?tv=auto", () => {
    const store = memory();
    for (const agent of TVS) {
      expect(isTelevision(agent, "?tv=0", store), agent).toBe(false);
    }
    expect(isTelevision(TVS[0], "", store)).toBe(false);
    expect(isTelevision(TVS[0], "?tv=auto", store)).toBe(true);
    expect(isTelevision(TVS[0], "", store)).toBe(true);
  });

  it("still honours ?tv=1 and ?tv=0 where storage is blocked or missing", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    for (const store of [blocked, null]) {
      expect(isTelevision(DESKTOP, "?tv=1", store)).toBe(true);
      expect(isTelevision(TVS[0], "?tv=0", store)).toBe(false);
      expect(isTelevision(TVS[0], "", store)).toBe(true);
      expect(isTelevision(DESKTOP, "", store)).toBe(false);
    }
  });
});
