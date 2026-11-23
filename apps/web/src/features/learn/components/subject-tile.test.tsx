// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubjectTile } from "./subject-tile";

const { band } = vi.hoisted(() => ({
  band: { now: "child" as "child" | "tween" | "teen" },
}));
vi.mock("@/lib/use-age-band", () => ({ useAgeBand: () => band.now }));

afterEach(cleanup);

const picture = () => screen.getByRole("button").querySelector("img");
const shown = (name: string, now: typeof band.now) => {
  band.now = now;
  render(<SubjectTile name={name} onSelect={() => {}} />);
};

describe("SubjectTile", () => {
  it("a child sees a picture over the name", () => {
    shown("Mathematics", "child");
    expect(picture()).not.toBeNull();
    expect(screen.getByRole("button").className).toContain("flex-col");
    expect(screen.getByRole("button").firstElementChild?.className).toContain(
      "aspect-4/3",
    );
  });

  it("a tween sees a wider, shorter picture over the name", () => {
    shown("Mathematics", "tween");
    expect(picture()).not.toBeNull();
    expect(screen.getByRole("button").className).toContain("flex-col");
    expect(screen.getByRole("button").firstElementChild?.className).toContain(
      "aspect-video",
    );
  });

  it("a teen or university learner sees a small teen picture beside the name, inside one hairline", () => {
    shown("Mathematics", "teen");
    const tile = screen.getByRole("button");
    const box = tile.firstElementChild as HTMLElement;
    expect(picture()?.getAttribute("src")).toBe("/brand/art/math-teen.webp");
    expect(box.dataset.subjectPicture).toBe("art");
    expect(tile.className).not.toContain("flex-col");
    expect(tile.className).toMatch(/(^| )border( |$)/);
    expect(box.className).not.toContain("border");
    expect(box.className).toContain("size-12");
  });

  it("shows the icon only for a subject with no picture", () => {
    shown("Religious Studies", "teen");
    const box = screen.getByRole("button").firstElementChild as HTMLElement;
    expect(box.dataset.subjectPicture).toBe("icon");
    expect(picture()).toBeNull();
  });
});
