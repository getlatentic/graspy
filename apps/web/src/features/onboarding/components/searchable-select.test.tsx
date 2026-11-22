// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { KeysApp } from "@/test/keys-app";
import SearchableSelect from "./searchable-select";

const OPTIONS = [
  { value: "g1", label: "Grade 1", group: "Primary" },
  { value: "g2", label: "Grade 2", group: "Primary" },
];

function Picker() {
  const [value, setValue] = useState("");
  return (
    <KeysApp>
      <SearchableSelect
        id="grade"
        label="Class"
        value={value}
        onChange={setValue}
        options={OPTIONS}
        placeholder="Choose your class"
      />
      <button type="button">elsewhere</button>
    </KeysApp>
  );
}

const field = () => screen.getByRole("combobox");
const isOpen = () => field().getAttribute("aria-expanded") === "true";

afterEach(cleanup);

describe("SearchableSelect", () => {
  it("opens on a click while the field already has focus, after a pick and after Escape", () => {
    render(<Picker />);
    fireEvent.focus(field());
    fireEvent.click(screen.getByRole("option", { name: "Grade 2" }));
    expect(isOpen()).toBe(false);
    expect((field() as HTMLInputElement).value).toBe("Grade 2");

    fireEvent.click(field());
    expect(isOpen()).toBe(true);

    fireEvent.keyDown(field(), { key: "Escape" });
    expect(isOpen()).toBe(false);
    fireEvent.click(field());
    expect(isOpen()).toBe(true);
  });

  it("opens on ArrowUp as well as ArrowDown", () => {
    render(<Picker />);
    fireEvent.keyDown(field(), { key: "ArrowUp" });
    expect(isOpen()).toBe(true);
  });

  it("closes when a touch or pointer press lands outside", () => {
    render(<Picker />);
    fireEvent.focus(field());
    expect(isOpen()).toBe(true);

    fireEvent.pointerDown(screen.getByText("elsewhere"));
    expect(isOpen()).toBe(false);
  });
});
