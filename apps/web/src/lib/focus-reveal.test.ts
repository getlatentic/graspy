// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { reveal } from "./focus-reveal";

afterEach(() => vi.restoreAllMocks());

function rect(left: number, top: number, w: number, h: number) {
  return {
    left,
    top,
    width: w,
    height: h,
    right: left + w,
    bottom: top + h,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function setup(style: Partial<CSSStyleDeclaration>) {
  document.body.innerHTML = `<div id="area"><button id="b">x</button></div>`;
  const area = document.getElementById("area")!;
  const button = document.getElementById("b")!;
  area.getBoundingClientRect = () => rect(0, 0, 300, 200);
  button.getBoundingClientRect = () => rect(100, 190, 50, 40);
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) =>
    el === area ? (style as CSSStyleDeclaration) : real(el),
  );
  return { area, button };
}

describe("reveal", () => {
  it("stops short of a scroller's scroll padding, which holds the overscan margin", () => {
    const { area, button } = setup({
      overflowY: "auto",
      overflowX: "visible",
      scrollPaddingBottom: "60px",
      scrollPaddingTop: "0px",
      scrollPaddingLeft: "0px",
      scrollPaddingRight: "0px",
    });
    reveal(button);
    expect(area.scrollTop).toBe(90);
  });

  it("never scrolls an overflow: hidden box", () => {
    const { area, button } = setup({
      overflowY: "hidden",
      overflowX: "hidden",
    });
    reveal(button);
    expect(area.scrollTop).toBe(0);
  });
});
