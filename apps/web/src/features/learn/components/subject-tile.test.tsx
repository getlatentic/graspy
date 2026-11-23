// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SubjectTile } from "./subject-tile";

afterEach(cleanup);

const picture = () => screen.getByRole("button").querySelector("img");

describe("SubjectTile", () => {
  it("a child sees a picture over the name", () => {
    render(<SubjectTile name="Mathematics" band="child" onSelect={() => {}} />);
    expect(picture()).not.toBeNull();
    expect(screen.getByRole("button").className).toContain("flex-col");
    expect(screen.getByRole("button").firstElementChild?.className).toContain(
      "aspect-4/3",
    );
  });

  it("a tween sees a wider, shorter picture over the name", () => {
    render(<SubjectTile name="Mathematics" band="tween" onSelect={() => {}} />);
    expect(picture()).not.toBeNull();
    expect(screen.getByRole("button").className).toContain("flex-col");
    expect(screen.getByRole("button").firstElementChild?.className).toContain(
      "aspect-video",
    );
  });

  it("a teen or university learner sees a small teen picture beside the name, not an icon", () => {
    render(<SubjectTile name="Mathematics" band="teen" onSelect={() => {}} />);
    expect(picture()?.getAttribute("src")).toBe("/brand/art/math-teen.webp");
    expect(screen.getByRole("button").className).not.toContain("flex-col");
    expect(screen.getByRole("button").className).toMatch(/(^| )border( |$)/);
    expect(screen.getByRole("button").querySelector("svg")).toBeNull();
    expect(screen.getByRole("button").firstElementChild?.className).toContain(
      "size-12",
    );
  });

  it("shows the icon only for a subject with no picture", () => {
    render(
      <SubjectTile name="Religious Studies" band="teen" onSelect={() => {}} />,
    );
    expect(picture()).toBeNull();
    expect(screen.getByRole("button").querySelector("svg")).not.toBeNull();
  });
});
