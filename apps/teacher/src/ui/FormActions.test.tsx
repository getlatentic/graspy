import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormActions } from "./FormActions";

describe("what a form says when its actions did not work", () => {
  it("reports the failure in the same region as the actions", () => {
    render(
      <FormActions failure={{ title: "Draft not saved", detail: "The library refused it." }}>
        <button type="submit">Save without writing</button>
      </FormActions>,
    );

    // Not "is it on the page" — a long form reporting at its top passes that
    // and still shows the teacher nothing. What matters is that the message and
    // the control they pressed are the same piece of screen.
    const region = screen.getByText("Draft not saved").closest("[aria-live]");
    expect(region).not.toBeNull();
    expect(region).toContainElement(screen.getByRole("button", { name: "Save without writing" }));
    expect(screen.getByText("The library refused it.")).toBeVisible();
  });

  it("says nothing at all until something has failed", () => {
    render(
      <FormActions failure={null}>
        <button type="submit">Save without writing</button>
      </FormActions>,
    );

    expect(screen.queryByText("Draft not saved")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save without writing" })).toBeVisible();
  });
});
