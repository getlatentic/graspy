import { describe, expect, it } from "vitest";
import { buttonStyles } from "./button-styles";

describe("small buttons", () => {
  it("are at least 44 pixels tall for a finger", () => {
    expect(buttonStyles("secondary", "sm").split(" ")).toContain(
      "pointer-coarse:min-h-11",
    );
  });
});
