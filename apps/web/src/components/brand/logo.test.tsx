// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Logo } from "./logo";

afterEach(cleanup);

// 20px wordmark, 28px sprout: the wordmark sits 4px (mt-1) below the sprout's top, so the leaves
// span the lowercase body and the stem drops to the descender line. Larger screens keep the ratios.
describe("Logo", () => {
  it("lines the sprout's leaves up with the wordmark's lowercase body", () => {
    const { container } = render(<Logo />);
    const lockup = container.firstElementChild;
    const wordmark = screen.getByAltText("graspy");
    const sprout = container.querySelector("img[src$='sprout.svg']");
    expect(lockup?.classList.contains("items-start")).toBe(true);
    expect(sprout?.classList.contains("h-7")).toBe(true);
    expect(wordmark.classList.contains("h-5")).toBe(true);
    expect(wordmark.classList.contains("mt-1")).toBe(true);
  });

  it("grows with the screen in the same proportions", () => {
    render(<Logo />);
    const wordmark = screen.getByAltText("graspy");
    // 3xl: 1.5 times the base (30px wordmark, 6px offset); 4xl: twice (40px, 8px).
    expect(wordmark.className).toContain("3xl:h-7.5");
    expect(wordmark.className).toContain("3xl:mt-1.5");
    expect(wordmark.className).toContain("4xl:h-10");
    expect(wordmark.className).toContain("4xl:mt-2");
  });
});
