// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackLink } from "./back-link";

afterEach(cleanup);

describe("BackLink", () => {
  it("is a link with the arrow before its label, the arrow hidden from readers and turned in right-to-left", () => {
    render(
      <MemoryRouter>
        <BackLink to="/app/learn/you">Back to You</BackLink>
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "Back to You" });
    expect(link.getAttribute("href")).toBe("/app/learn/you");
    const arrow = link.querySelector("svg")!;
    expect(arrow.getAttribute("aria-hidden")).toBe("true");
    expect(arrow.classList).toContain("rtl:rotate-180");
    expect(link.firstElementChild).toBe(arrow);
  });

  it("is a button when it has an action to run", () => {
    const back = vi.fn();
    render(<BackLink onClick={back}>Back to Mathematics</BackLink>);

    fireEvent.click(
      screen.getByRole("button", { name: "Back to Mathematics" }),
    );

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("has a 2.75rem target that takes no room, and a visible focus ring", () => {
    render(<BackLink onClick={() => undefined}>Back</BackLink>);

    const { classList } = screen.getByRole("button");
    expect(classList).toContain("py-3");
    expect(classList).toContain("-my-3");
    expect(classList).toContain("focus-visible:outline-2");
    expect(classList).toContain("focus-visible:outline-accent");
  });
});

// Only the component, the chat bar's round icon button and nothing else draws an
// ArrowLeft, so every "Back to ..." line looks and aligns the same.
function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("the app's back links", () => {
  it("all come from BackLink", () => {
    const root = join(process.cwd(), "src");
    const drawing = sources(root)
      .filter((path) => /ArrowLeft/.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(root.length + 1))
      .sort();

    expect(drawing).toEqual([
      "components/ui/back-link.tsx",
      "features/learn/components/chat-context-bar.tsx",
    ]);
  });
});
