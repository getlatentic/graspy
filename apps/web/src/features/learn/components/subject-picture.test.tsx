// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubjectPicture } from "./subject-picture";

const { band } = vi.hoisted(() => ({
  band: { now: "child" as string | null },
}));
vi.mock("@/lib/use-age-band", () => ({ useAgeBand: () => band.now }));

afterEach(cleanup);

const shown = (
  props: Parameters<typeof SubjectPicture>[0],
  now: string | null = "child",
) => {
  band.now = now;
  const { container } = render(<SubjectPicture {...props} />);
  return container.firstElementChild as HTMLElement;
};

describe("SubjectPicture", () => {
  it.each(["child", "tween", "teen"] as const)(
    "shows the %s picture and no icon",
    (now) => {
      const box = shown({ name: "Mathematics" }, now);
      expect(box.dataset.subjectPicture).toBe("art");
      expect(box.querySelector("img")?.getAttribute("src")).toBe(
        `/brand/art/math-${now}.webp`,
      );
      expect(box.querySelector("svg")).toBeNull();
    },
  );

  it.each([null, "adult"])(
    "falls back to the child picture for band %s",
    (now) => {
      const box = shown({ name: "Mathematics" }, now);
      expect(box.querySelector("img")?.getAttribute("src")).toBe(
        "/brand/art/math-child.webp",
      );
      expect(box.className).toContain("border-4");
    },
  );

  it("outlines the picture thicker for a younger band", () => {
    expect(shown({ name: "Mathematics" }, "child").className).toContain(
      "border-4",
    );
    cleanup();
    expect(shown({ name: "Mathematics" }, "tween").className).toContain(
      "border-2",
    );
    cleanup();
    const teen = shown({ name: "Mathematics" }, "teen").className;
    expect(teen).toMatch(/(^| )border( |$)/);
    expect(teen).not.toContain("border-2");
  });

  it("leaves the outline to the card when asked", () => {
    expect(
      shown({ name: "Mathematics", frame: "none" }).className,
    ).not.toContain("border");
  });

  it("offers its small copies when told the width it is shown at", () => {
    const img = shown(
      { name: "Mathematics", sizes: "48px" },
      "teen",
    ).querySelector("img")!;
    expect(img.getAttribute("sizes")).toBe("48px");
    expect(img.getAttribute("srcset")).toBe(
      "/brand/art/math-teen-160.webp 160w, /brand/art/math-teen-320.webp 320w, /brand/art/math-teen.webp 640w",
    );
  });

  it("carries the dimming class on the picture, which the stylesheet turns on only in the dark set", () => {
    const img = shown({ name: "Mathematics" }).querySelector("img")!;
    expect(img.classList.contains("picture-dim")).toBe(true);
  });

  it("loads lazily unless it is the page's largest paint", () => {
    const lazy = shown({ name: "Mathematics" }).querySelector("img")!;
    expect(lazy.getAttribute("loading")).toBe("lazy");
    expect(lazy.getAttribute("fetchpriority")).toBeNull();
    cleanup();
    const hero = shown({ name: "Mathematics", priority: true }).querySelector(
      "img",
    )!;
    expect(hero.getAttribute("loading")).toBe("eager");
    expect(hero.getAttribute("fetchpriority")).toBe("high");
  });

  it("falls back to the subject's icon on a tinted square only without a picture", () => {
    const box = shown({ name: "Religious Studies" }, "teen");
    expect(box.dataset.subjectPicture).toBe("icon");
    expect(box.querySelector("img")).toBeNull();
    expect(box.querySelector("svg")).not.toBeNull();
    expect(box.className).toContain("bg-");
  });
});
