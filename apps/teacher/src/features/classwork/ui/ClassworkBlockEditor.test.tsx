import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ClassworkBlockEditor } from "./ClassworkBlockEditor";

describe("ClassworkBlockEditor", () => {
  it("edits Markdown-backed content and saves the normalized draft", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ClassworkBlockEditor
        label="Review"
        text="Compare **one half** and two quarters."
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    const editor = await screen.findByRole("textbox", { name: "Edit Review" });
    await user.click(editor);
    await user.keyboard("{Control>}a{/Control}Compare one half and two quarters using the fraction strips.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith("Compare one half and two quarters using the fraction strips.");
  });

  it("keeps cancel separate from persistence and rejects empty content", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(
      <ClassworkBlockEditor
        label="Practice"
        text="Solve two questions."
        onCancel={onCancel}
        onSave={onSave}
      />,
    );

    const editor = await screen.findByRole("textbox", { name: "Edit Practice" });
    await user.click(editor);
    await user.keyboard("{Control>}a{/Control}{Backspace}");
    expect(screen.getByRole("alert")).toHaveTextContent("Add lesson content before saving this change.");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("adds a table through the constrained formatting toolbar", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ClassworkBlockEditor
        label="Worked example"
        text="Compare the fractions."
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(await screen.findByRole("textbox", { name: "Edit Worked example" }));
    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("table")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith(expect.stringContaining("|"));
  });

  it("keeps the editor open and reports a durable-save failure", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("The draft changed in another window."));
    render(
      <ClassworkBlockEditor
        label="Solution"
        text="The answer is one half."
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    const editor = await screen.findByRole("textbox", { name: "Edit Solution" });
    await user.click(editor);
    await user.keyboard(" Add the unit.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("The draft changed in another window.")).toBeVisible();
    expect(editor).toBeVisible();
  });
});
