// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveUserProfile } from "@/lib/user-storage";
import { HOME_GRID } from "@/features/learn/lib/home-grid";
import { PageSkeleton } from "./page-skeleton";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const blocks = (container: HTMLElement) =>
  container.querySelectorAll("[data-skeleton]");

describe("PageSkeleton", () => {
  it("draws Home's own grid, with the resume card, the subjects and the rail where they will be", () => {
    const { container } = render(<PageSkeleton shape="home" />);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toBe(HOME_GRID);
    const sections = grid.querySelectorAll("section");
    expect(sections).toHaveLength(2);
    expect(sections[1]!.querySelectorAll("li")).toHaveLength(4);
    expect(grid.querySelector(".lg\\:flex")).not.toBeNull();
  });

  it("draws a subject page's header, progress and rows", () => {
    const { container } = render(<PageSkeleton shape="subject" />);
    expect(container.querySelectorAll("li")).toHaveLength(5);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "max-w-3xl",
    );
  });

  it("draws a plain list for any other page", () => {
    const { container } = render(<PageSkeleton shape="list" />);
    expect(container.querySelectorAll("li")).toHaveLength(3);
  });

  it("holds no words and is hidden from assistive technology, which hears the status instead", () => {
    for (const shape of ["home", "subject", "list"] as const) {
      const { container, unmount } = render(<PageSkeleton shape={shape} />);
      expect(container.textContent).toBe("");
      for (const block of blocks(container)) {
        expect(block.getAttribute("aria-hidden")).toBe("true");
      }
      expect(blocks(container).length).toBeGreaterThan(3);
      unmount();
    }
  });

  it("pulses only for those who have not asked for less motion", () => {
    const { container } = render(<PageSkeleton shape="home" />);
    for (const block of blocks(container)) {
      expect(block.className).toContain("motion-safe:animate-pulse");
    }
  });

  it("shapes the subject tiles by the learner's age band, as the page does", () => {
    const tiles = (container: HTMLElement) =>
      container.querySelectorAll("section:nth-of-type(2) li");
    const child = render(<PageSkeleton shape="home" />);
    expect(child.container.querySelector(".aspect-4\\/3")).not.toBeNull();
    child.unmount();

    saveUserProfile({
      level: "undergraduate",
      course: "Law",
      onboardingCompleted: true,
    });
    const teen = render(<PageSkeleton shape="home" />);
    expect(tiles(teen.container)).toHaveLength(4);
    expect(teen.container.querySelector(".aspect-4\\/3")).toBeNull();
  });
});
