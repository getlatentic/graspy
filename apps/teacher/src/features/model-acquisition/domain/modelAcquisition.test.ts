import { describe, expect, it } from "vitest";

import {
  acquisitionPhaseLabel,
  formatFileSize,
  normalizeAcquisitionFailure,
} from "./modelAcquisition";

describe("model acquisition presentation", () => {
  it("formats the approved file size for a teacher", () => {
    expect(formatFileSize(2_841_481_184)).toBe("2.6 GB");
  });

  it("uses action language for verification", () => {
    expect(acquisitionPhaseLabel("verifying")).toBe("Checking file");
  });

  it("preserves a structured native failure", () => {
    expect(
      normalizeAcquisitionFailure({ code: "cancelled", message: "Setup was stopped." }),
    ).toEqual({ code: "cancelled", message: "Setup was stopped." });
  });

  it("does not expose an unknown bridge error", () => {
    expect(normalizeAcquisitionFailure(new Error("invoke failed"))).toEqual({
      code: "setup_failed",
      message: "Setup could not be completed. Try again.",
    });
  });
});
