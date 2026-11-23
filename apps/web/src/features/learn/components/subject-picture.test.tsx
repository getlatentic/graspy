// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SubjectPicture } from "./subject-picture";

afterEach(cleanup);

const shown = (props: Parameters<typeof SubjectPicture>[0]) => {
  const { container } = render(<SubjectPicture {...props} />);
  return container.firstElementChild as HTMLElement;
};

describe("SubjectPicture", () => {
  it.each(["child", "tween", "teen"] as const)(
    "shows the %s picture and no icon",
    (band) => {
      const box = shown({ name: "Mathematics", band });
      expect(box.querySelector("img")?.getAttribute("src")).toBe(
        `/brand/art/math-${band}.webp`,
      );
      expect(box.querySelector("svg")).toBeNull();
    },
  );

  it("outlines the picture thicker for a younger band", () => {
    expect(shown({ name: "Mathematics", band: "child" }).className).toContain(
      "border-4",
    );
    expect(shown({ name: "Mathematics", band: "tween" }).className).toContain(
      "border-2",
    );
    const teen = shown({ name: "Mathematics", band: "teen" }).className;
    expect(teen).toMatch(/(^| )border( |$)/);
    expect(teen).not.toContain("border-2");
  });

  it("leaves the outline to the card when asked", () => {
    expect(
      shown({ name: "Mathematics", frame: "none" }).className,
    ).not.toContain("border");
  });

  it("falls back to the subject's icon on a tinted square only without a picture", () => {
    const box = shown({ name: "Religious Studies", band: "teen" });
    expect(box.querySelector("img")).toBeNull();
    expect(box.querySelector("svg")).not.toBeNull();
    expect(box.className).toContain("bg-");
  });
});
