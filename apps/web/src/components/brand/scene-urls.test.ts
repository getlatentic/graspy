import { describe, expect, it } from "vitest";
import { sceneUrl } from "./scene-urls";

describe("sceneUrl", () => {
  it("shows a still life until the age is known", () => {
    expect(sceneUrl(null)).toBe("/brand/art/scene-still-life.webp");
  });

  it("gives a tween and a teen a scene each", () => {
    expect(sceneUrl("tween")).toBe("/brand/art/scene-tween.webp");
    expect(sceneUrl("teen")).toBe("/brand/art/scene-desk.webp");
  });
});
