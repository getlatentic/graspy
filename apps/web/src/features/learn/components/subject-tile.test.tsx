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
  });

  it("a tween sees a wider, shorter picture over the name", () => {
    render(<SubjectTile name="Mathematics" band="tween" onSelect={() => {}} />);
    expect(picture()).not.toBeNull();
    expect(screen.getByRole("button").className).toContain("flex-col");
    expect(
      screen.getByRole("button").querySelector("div")?.className,
    ).toContain("aspect-video");
  });

  it("a teen or university learner sees an icon and no cartoon", () => {
    render(<SubjectTile name="Mathematics" band="teen" onSelect={() => {}} />);
    expect(picture()).toBeNull();
    expect(screen.getByRole("button").querySelector("svg")).not.toBeNull();
  });
});
