// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScopeIcon } from "./thread-row";

vi.mock("@/lib/use-age-band", () => ({ useAgeBand: () => "teen" }));

afterEach(cleanup);

describe("ScopeIcon", () => {
  it("shows the subject's picture for the learner's band", () => {
    const { container } = render(
      <ScopeIcon kind="topic" subject="Mathematics" className="size-9" />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/brand/art/math-teen.webp",
    );
  });

  it("keeps a chat icon for the general and earlier conversations", () => {
    const { container } = render(
      <ScopeIcon kind="general" subject={null} className="size-10" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
