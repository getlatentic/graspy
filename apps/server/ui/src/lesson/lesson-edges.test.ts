import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The page frames the lesson in a column of its own, with the back link at the
// column's edge. The lesson keeps no inset of its own inside the frame, so its
// breadcrumb, title, bar and card share that edge, in either direction.
const view = readFileSync(
  new URL("./lesson-view.tsx", import.meta.url),
  "utf-8",
);

describe("the lesson's edges", () => {
  it("are the frame's: the root section has no padding or margin", () => {
    const root =
      /<section aria-label=\{words\.label\} className="([^"]*)"/.exec(
        view,
      )?.[1];
    expect(root).toBeDefined();
    expect(root).not.toMatch(/(?:^|\s)-?[pm][xyselrtb]?-\d/);
  });
});
