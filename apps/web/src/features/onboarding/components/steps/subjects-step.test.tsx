// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { afterEach, describe, expect, it } from "vitest";
import { KeysApp } from "@/test/keys-app";
import type { useSubjectChoices } from "../../hooks/use-subject-choices";
import SubjectsStep from "./subjects-step";

afterEach(cleanup);

const subjects = {
  available: ["Maths", "English", "Art"].map((label) => ({
    id: label,
    label,
    recommended: false,
  })),
  loading: false,
  error: null,
  refetch: () => undefined,
} as unknown as ReturnType<typeof useSubjectChoices>;

function Step() {
  const form = useForm({ defaultValues: { selectedSubjects: [] as string[] } });
  return (
    <KeysApp>
      <FormProvider
        {...(form as unknown as Parameters<typeof FormProvider>[0])}
      >
        <SubjectsStep subjects={subjects} />
      </FormProvider>
    </KeysApp>
  );
}

describe("the subject list", () => {
  it("moves between rows with the up and down arrows, as a remote's pad does", () => {
    render(<Step />);
    const [maths, english, art] = screen.getAllByRole("button");
    maths.focus();
    fireEvent.keyDown(maths, { key: "ArrowDown" });
    expect(document.activeElement).toBe(english);
    fireEvent.keyDown(english, { key: "ArrowDown" });
    expect(document.activeElement).toBe(art);
    fireEvent.keyDown(art, { key: "ArrowDown" });
    expect(document.activeElement).toBe(art);
    fireEvent.keyDown(art, { key: "ArrowUp" });
    expect(document.activeElement).toBe(english);
  });

  it("makes each row at least 48px tall to hit", () => {
    render(<Step />);
    for (const row of screen.getAllByRole("button")) {
      expect(row.classList.contains("min-h-12")).toBe(true);
    }
  });
});
