import { describe, expect, it } from "vitest";

import { classworkEditCharacterLimit, validateClassworkEdit } from "./classworkEditing";

describe("validateClassworkEdit", () => {
  it("normalizes valid teacher content without changing its structure", () => {
    expect(validateClassworkEdit("  Use **two equal parts**.\n\n1. Fold the strip.  ")).toEqual({
      valid: true,
      text: "Use **two equal parts**.\n\n1. Fold the strip.",
    });
  });

  it("rejects empty, oversized and inline-image content", () => {
    expect(validateClassworkEdit("   ")).toEqual(expect.objectContaining({ valid: false }));
    expect(validateClassworkEdit("a".repeat(classworkEditCharacterLimit + 1))).toEqual(
      expect.objectContaining({ valid: false }),
    );
    expect(validateClassworkEdit("![Diagram](https://example.com/diagram.png)")).toEqual(
      expect.objectContaining({ valid: false }),
    );
    expect(validateClassworkEdit("<IMG src='https://example.com/diagram.png'>")).toEqual(
      expect.objectContaining({ valid: false }),
    );
  });
});
