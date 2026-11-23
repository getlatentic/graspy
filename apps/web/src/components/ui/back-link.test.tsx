// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("takes the room of its text only: no margin or vertical padding of its own to change the page's spacing", () => {
    render(<BackLink onClick={() => undefined}>Back</BackLink>);

    const classes = [...screen.getByRole("button").classList];
    expect(classes.filter((name) => /^-?(?:m|p)[ytb]?-/.test(name))).toEqual(
      [],
    );
    expect(classes).not.toContain("min-h-11");
  });

  it("has a 2.75rem touch target that is a pseudo-element, and a visible focus ring", () => {
    render(<BackLink onClick={() => undefined}>Back</BackLink>);

    const { classList } = screen.getByRole("button");
    expect(classList).toContain("relative");
    expect(classList).toContain("after:absolute");
    expect(classList).toContain("after:-inset-y-3");
    expect(classList).toContain("focus-visible:outline-2");
    expect(classList).toContain("focus-visible:outline-accent");
  });
});

// Every way back is drawn by back-link.tsx, so no page has an arrow of its own
// to align or turn. The files are read by the bundler's glob, from the source
// root, wherever the tests run from.
const sources = import.meta.glob<string>("/src/**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});
const IMPORTS_ARROW_LEFT =
  /import\s*(?:type\s*)?\{[^}]*\bArrowLeft\b[^}]*\}\s*from\s*["']lucide-react["']/;

describe("the app's back links", () => {
  it("are all drawn by back-link.tsx: no other file imports the ArrowLeft icon", () => {
    const files = Object.keys(sources);
    expect(files).toContain("/src/components/ui/back-link.tsx");

    const importing = files.filter((file) =>
      IMPORTS_ARROW_LEFT.test(sources[file]),
    );

    expect(importing).toEqual(["/src/components/ui/back-link.tsx"]);
  });
});
