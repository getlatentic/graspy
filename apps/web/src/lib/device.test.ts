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
const TIZEN = "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) Chrome/85";
const WEBOS =
  "Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/79 Safari/537.36 WebAppManager";

describe("isTelevision", () => {
  it("knows a TV by its agent", () => {
    for (const agent of [
      TIZEN,
      WEBOS,
      "Mozilla/5.0 (Linux; Android 9; AFTMM) Silk",
      "Mozilla/5.0 (Linux; Android 12; BRAVIA 4K) Chrome/108",
      "Mozilla/5.0 (X11; Linux) CrKey/1.56",
    ]) {
      expect(isTelevision(agent, "", memory()), agent).toBe(true);
    }
    expect(isTelevision(DESKTOP, "", memory())).toBe(false);
  });

  it("is forced on by ?tv=1, which is kept, and off by ?tv=0", () => {
    const store = memory();
    expect(isTelevision(DESKTOP, "?tv=1", store)).toBe(true);
    expect(isTelevision(DESKTOP, "", store)).toBe(true);
    expect(isTelevision(DESKTOP, "?tv=0", store)).toBe(false);
    expect(isTelevision(DESKTOP, "", store)).toBe(false);
  });

  it("still honours ?tv=1 where storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    expect(isTelevision(DESKTOP, "?tv=1", blocked)).toBe(true);
    expect(isTelevision(DESKTOP, "", blocked)).toBe(false);
  });
});
