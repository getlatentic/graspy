import { describe, expect, it } from "vitest";

import { schemeWorkspaceView } from "./schemeWorkspaceView";

describe("which screen the scheme workspace shows", () => {
  it("shows nothing but the loading state until the store answers", () => {
    expect(schemeWorkspaceView("loading", false)).toBe("loading");
    expect(schemeWorkspaceView("loading", true)).toBe("loading");
  });

  it("reports a store that could not answer, whether or not a scheme exists", () => {
    expect(schemeWorkspaceView("failed", true)).toBe("failed");
    expect(schemeWorkspaceView("failed", false)).toBe("failed");
  });

  it("offers a way to begin when this class and term have no scheme", () => {
    expect(schemeWorkspaceView("ready", false)).toBe("start");
  });

  it("plans the scheme once there is one", () => {
    expect(schemeWorkspaceView("ready", true)).toBe("planner");
  });
});
