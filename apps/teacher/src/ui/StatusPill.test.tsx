import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { StatusPill } from "./StatusPill";

describe("StatusPill", () => {
  it("states the status as plain text", () => {
    render(<StatusPill tone="positive">Confirmed</StatusPill>);

    expect(screen.getByText("Confirmed").tagName).toBe("SPAN");
  });

  it("keeps a long status whole rather than shortening it", () => {
    render(<StatusPill tone="information">Source wording adjusted</StatusPill>);

    expect(screen.getByText("Source wording adjusted")).toBeInTheDocument();
    expect(screen.queryByText(/…|\.\.\./)).not.toBeInTheDocument();
  });

  it("is not a control: no role, and nothing to focus", () => {
    render(<StatusPill tone="positive">Confirmed</StatusPill>);
    const pill = screen.getByText("Confirmed");

    expect(pill).not.toHaveAttribute("role");
    expect(pill).not.toHaveAttribute("tabindex");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stays out of the tab order", async () => {
    render(
      <>
        <button type="button">Before</button>
        <StatusPill tone="neutral">Draft</StatusPill>
        <button type="button">After</button>
      </>,
    );

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });

  it("adds no second control when a lesson row is itself a button", () => {
    render(
      <button type="button">
        Millions and billions
        <StatusPill tone="positive" size="sm">
          Confirmed
        </StatusPill>
      </button>,
    );

    const row = screen.getByRole("button");
    expect(row.querySelector("button")).toBeNull();
    expect(row).toHaveTextContent("Millions and billions");
    expect(row).toHaveTextContent("Confirmed");
  });
});
