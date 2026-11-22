// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Logo } from "./logo";

afterEach(cleanup);

describe("Logo", () => {
  it("is one lockup image named graspy, with its ratio set so nothing shifts", () => {
    const { container } = render(<Logo />);
    const logo = screen.getByAltText("graspy");
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(logo.getAttribute("src")).toBe("/brand/graspy-lockup-v1.svg");
    expect(logo.getAttribute("width")).toBe("4552");
    expect(logo.getAttribute("height")).toBe("836");
    expect(logo.classList.contains("w-auto")).toBe(true);
  });

  it("is 20px tall at the header size and grows with the screen in the same proportions", () => {
    render(<Logo />);
    const logo = screen.getByAltText("graspy");
    for (const name of [
      "h-5",
      "2xl:h-6.25",
      "3xl:h-7.5",
      "4xl:h-10",
      "5xl:h-15",
    ]) {
      expect(logo.classList.contains(name), name).toBe(true);
    }
  });
});
