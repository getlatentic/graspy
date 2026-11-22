// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeysApp } from "@/test/keys-app";
import SearchableSelect from "./searchable-select";

const OPTIONS = [
  { value: "g1", label: "Grade 1", group: "Primary" },
  { value: "g2", label: "Grade 2", group: "Primary" },
  { value: "g3", label: "Grade 3", group: "Primary" },
  { value: "s1", label: "Year 1", group: "Secondary" },
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

const field = () => screen.getByRole("combobox") as HTMLInputElement;
const isOpen = () => field().getAttribute("aria-expanded") === "true";
const elsewhere = () => screen.getByText("elsewhere");

type Where = { clientX: number; clientY: number };
const at = (x: number, y: number): Where => ({ clientX: x, clientY: y });
const press = (target: Element, kind: string, where = at(5, 5)) =>
  fireEvent(
    target,
    new PointerEvent(kind, { bubbles: true, pointerId: 1, ...where }),
  );

const scrolled = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = scrolled;
});

afterEach(() => {
  cleanup();
  scrolled.mockClear();
});

describe("SearchableSelect opening", () => {
  it("opens on a click while the field already has focus, after a pick and after Escape", () => {
    render(<Picker />);
    fireEvent.focus(field());
    fireEvent.click(screen.getByRole("option", { name: "Grade 2" }));
    expect(isOpen()).toBe(false);
    expect(field().value).toBe("Grade 2");

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

  it("leaves a tap (pointerdown, focus, click) open", () => {
    render(<Picker />);
    press(field(), "pointerdown");
    fireEvent.focus(field());
    press(field(), "pointerup");
    fireEvent.click(field());
    expect(isOpen()).toBe(true);
  });

  it("keeps the highlight when a click in the open field only moves the caret", () => {
    render(<Picker />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: "grade" } });
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(field().getAttribute("aria-activedescendant")).toBe(
      "grade-option-g3",
    );

    fireEvent.click(field());
    expect(field().getAttribute("aria-activedescendant")).toBe(
      "grade-option-g3",
    );
    expect(field().value).toBe("grade");
  });
});

describe("SearchableSelect closing", () => {
  it("stays open for a press inside the list", () => {
    render(<Picker />);
    fireEvent.focus(field());
    const option = screen.getByRole("option", { name: "Grade 1" });

    press(option, "pointerdown");
    press(option, "pointerup");
    expect(isOpen()).toBe(true);
  });

  it("stays open for a swipe outside, a scroll that the browser cancels or that moves", () => {
    render(<Picker />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: "gra" } });

    press(document.body, "pointerdown");
    press(document.body, "pointercancel");
    expect(isOpen()).toBe(true);

    press(document.body, "pointerdown", at(100, 100));
    press(document.body, "pointerup", at(100, 160));
    expect(isOpen()).toBe(true);
    expect(field().value).toBe("gra");
  });

  it("closes on a real tap outside", () => {
    render(<Picker />);
    fireEvent.focus(field());

    press(elsewhere(), "pointerdown", at(100, 100));
    press(elsewhere(), "pointerup", at(102, 101));
    expect(isOpen()).toBe(false);
  });
});

describe("SearchableSelect highlight", () => {
  it("scrolls the option the arrow keys reach into view, and not one a hover reaches", () => {
    render(<Picker />);
    fireEvent.focus(field());
    scrolled.mockClear();

    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(scrolled).toHaveBeenCalledWith({ block: "nearest" });

    scrolled.mockClear();
    fireEvent.mouseEnter(screen.getByRole("option", { name: "Year 1" }));
    expect(scrolled).not.toHaveBeenCalled();
  });
});

describe("SearchableSelect list", () => {
  it("keeps the light palette, since it is drawn outside the page that pins it", () => {
    render(<Picker />);
    fireEvent.focus(field());
    const list = screen.getByRole("listbox");
    expect(list.parentElement?.classList.contains("theme-light")).toBe(true);
  });
});
