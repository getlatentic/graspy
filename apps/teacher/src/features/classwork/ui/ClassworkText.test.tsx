import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ClassworkText } from "./ClassworkText";

describe("ClassworkText", () => {
  it("renders inline mathematics instead of exposing authoring delimiters", () => {
    const { container } = render(
      <ClassworkText text="Solve $x + 5 = 12$ and **explain the inverse operation**." />,
    );

    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.querySelector("strong")).toHaveTextContent(
      "explain the inverse operation",
    );
    expect(container).not.toHaveTextContent("$x + 5 = 12$");
  });

  it("does not interpret generated HTML", () => {
    const { container } = render(
      <ClassworkText text={'Safe text <script data-test="unsafe">alert(1)</script>'} />,
    );

    expect(container.querySelector("script")).toBeNull();
  });

  it("never renders an image supplied through generated Markdown", () => {
    render(<ClassworkText text="![Invented diagram](https://example.com/invented.png)" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
