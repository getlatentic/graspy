import { describe, expect, it } from "vitest";
import { sceneImage } from "./scene-urls";

describe("sceneImage", () => {
  it("shows a still life until the age is known", () => {
    expect(sceneImage(null).src).toBe("/brand/art/scene-still-life.webp");
  });

  it("gives each age band its own scene", () => {
    expect(sceneImage("child").src).toBe("/brand/art/hero-kids.webp");
    expect(sceneImage("tween").src).toBe("/brand/art/scene-tween.webp");
    expect(sceneImage("teen").src).toBe("/brand/art/scene-desk.webp");
  });
});
