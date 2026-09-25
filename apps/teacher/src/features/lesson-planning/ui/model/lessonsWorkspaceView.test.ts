import { describe, expect, it } from "vitest";

import { lessonsWorkspaceView } from "./lessonsWorkspaceView";

describe("which screen the lessons workspace shows", () => {
  it("shows nothing but the loading state until the store answers", () => {
    expect(lessonsWorkspaceView("loading", false)).toBe("loading");
    expect(lessonsWorkspaceView("loading", true)).toBe("loading");
  });

  it("reports a store that could not answer, whatever else was open", () => {
    expect(lessonsWorkspaceView("failed", true)).toBe("failed");
  });

  it("lets writing a lesson replace the week", () => {
    expect(lessonsWorkspaceView("ready", true)).toBe("writing");
  });

  it("shows the week when nothing is being written", () => {
    expect(lessonsWorkspaceView("ready", false)).toBe("week");
  });
});
