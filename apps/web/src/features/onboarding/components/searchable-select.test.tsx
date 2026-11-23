// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { whileArrowMoves } from "@/lib/spatial-nav/arrival";
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
const startSearch = () =>
  fireEvent.click(screen.getByRole("button", { name: /search/i }));

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
  delete document.documentElement.dataset.device;
  vi.useRealTimers();
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

  it("leaves the arrows to focus navigation while closed, and opens on Alt with Up or Down", () => {
    render(<Picker />);
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      const untouched = fireEvent.keyDown(field(), { key });
      expect(untouched, key).toBe(true);
      expect(isOpen(), key).toBe(false);
    }
    fireEvent.keyDown(field(), { key: "ArrowUp", altKey: true });
    expect(isOpen()).toBe(true);
  });

  it("opens on a focus that an arrow key caused only when OK or a click asks", () => {
    render(<Picker />);
    whileArrowMoves(() => field().focus());
    expect(isOpen()).toBe(false);
    fireEvent.keyDown(field(), { key: "Enter" });
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
    startSearch();
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
    startSearch();
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
    expect(list.closest(".theme-light")).toBeTruthy();
  });

  it("scrolls with a wide scrollbar and keeps the page still behind it", () => {
    render(<Picker />);
    fireEvent.focus(field());
    expect(screen.getByRole("listbox").classList.contains("pick-scroll")).toBe(
      true,
    );
  });

  it("is placed at a fixed spot from its first render, so opening it cannot scroll or shift the page", () => {
    render(<Picker />);
    fireEvent.focus(field());
    const popup = screen.getByRole("listbox").closest(".art-popup");
    expect((popup as HTMLElement).style.position).toBe("fixed");
  });

  it("gives each option a row tall enough for a pointer remote", () => {
    render(<Picker />);
    fireEvent.focus(field());
    const row = screen.getByRole("option", { name: "Grade 1" });
    expect(row.classList.contains("min-h-12")).toBe(true);
  });
});

describe("SearchableSelect as a button, not a text field", () => {
  it("is read-only with no text keyboard, so a TV or a phone shows the list at once", () => {
    render(<Picker />);
    expect(field().readOnly).toBe(true);
    expect(field().getAttribute("inputmode")).toBe("none");
    fireEvent.focus(field());
    expect(isOpen()).toBe(true);
    expect(field().readOnly).toBe(true);
    expect(field().classList.contains("caret-transparent")).toBe(true);
  });

  it("is a button with no device or pointer test: a desktop user agent with a mouse gets it too", () => {
    const real = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(pointer: fine)" || query === "(hover: hover)",
    })) as typeof window.matchMedia;
    render(<Picker />);
    window.matchMedia = real;
    expect(field().readOnly).toBe(true);
    expect(field().getAttribute("inputmode")).toBe("none");
    expect(document.documentElement.dataset.device).toBeUndefined();
  });

  it("does not raise the keyboard when it is clicked or focused: it stays read-only", () => {
    render(<Picker />);
    field().focus();
    fireEvent.click(field());
    expect(isOpen()).toBe(true);
    expect(field().readOnly).toBe(true);
    expect(field().getAttribute("inputmode")).toBe("none");
  });

  it("does not claim a filtering list while it cannot filter, and names its key", () => {
    render(<Picker />);
    expect(field().getAttribute("aria-autocomplete")).toBe("none");
    expect(field().getAttribute("aria-keyshortcuts")).toBe("/");
  });

  it("keeps the chosen name in the field while its list is open", () => {
    render(<Picker />);
    fireEvent.focus(field());
    fireEvent.click(screen.getByRole("option", { name: "Grade 2" }));
    fireEvent.click(field());
    expect(isOpen()).toBe(true);
    expect(field().value).toBe("Grade 2");
  });

  it("has a Search button that can be tabbed to, since Tab closes the list", () => {
    render(<Picker />);
    const search = screen.getByRole("button", { name: /search/i });
    expect(search.tabIndex).toBe(0);
    expect(
      field().compareDocumentPosition(search) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("turns into a filtering text field when Search is pressed, and is editable before it is focused again so the keyboard rises", () => {
    render(<Picker />);
    field().focus();
    const editableAtFocus: boolean[] = [];
    field().addEventListener("focus", () =>
      editableAtFocus.push(!field().readOnly && field().inputMode === "search"),
    );
    startSearch();
    expect(editableAtFocus).toEqual([true]);
    expect(document.activeElement).toBe(field());
    expect(field().getAttribute("aria-autocomplete")).toBe("list");
    fireEvent.change(field(), { target: { value: "year" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("turns into the same text field from a keyboard with the / key, which is not typed", () => {
    render(<Picker />);
    field().focus();
    const slash = new KeyboardEvent("keydown", {
      key: "/",
      bubbles: true,
      cancelable: true,
    });
    field().dispatchEvent(slash);
    expect(slash.defaultPrevented).toBe(true);
    expect(field().readOnly).toBe(false);
    expect(document.activeElement).toBe(field());
  });

  it("goes back to a button when it closes", () => {
    render(<Picker />);
    fireEvent.focus(field());
    startSearch();
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(field().readOnly).toBe(true);
    expect(screen.getByRole("button", { name: /search/i })).toBeTruthy();
  });
});

describe("SearchableSelect jumping", () => {
  const COUNTRIES = ["Albania", "Algeria", "Belgium", "Brazil", "Chad"]
    .concat(["Denmark", "Egypt", "Fiji", "Ghana", "Haiti", "India", "Japan"])
    .concat(["Kenya", "Laos"])
    .map((label) => ({ value: label.toLowerCase(), label }));

  function Countries({ dir }: { dir?: "rtl" }) {
    const [value, setValue] = useState("");
    return (
      <KeysApp>
        <div dir={dir}>
          <SearchableSelect
            id="country"
            label="Country"
            value={value}
            onChange={setValue}
            options={COUNTRIES}
            placeholder="Choose"
          />
        </div>
      </KeysApp>
    );
  }
  const active = () => field().getAttribute("aria-activedescendant");
  const letterButton = (name: RegExp) =>
    screen.getByRole("button", { name, hidden: true });

  it("goes to the option a letter starts, with the whole list still shown", () => {
    render(<Countries />);
    fireEvent.keyDown(field(), { key: "j" });
    expect(isOpen()).toBe(true);
    expect(active()).toBe("country-option-japan");
    expect(screen.getAllByRole("option")).toHaveLength(COUNTRIES.length);
    expect(field().value).toBe("");
  });

  it("jumps to a name from its first letters typed on the closed field, so Slo finds Slovakia", () => {
    const names = ["Slovakia", "Slovenia", "Spain", "Sweden"].map((label) => ({
      value: label.toLowerCase(),
      label,
    }));
    function Slo() {
      const [value, setValue] = useState("");
      return (
        <KeysApp>
          <SearchableSelect
            id="c"
            label="Country"
            value={value}
            onChange={setValue}
            options={names}
            placeholder="Choose"
          />
        </KeysApp>
      );
    }
    render(<Slo />);
    for (const key of ["S", "l", "o"]) {
      fireEvent.keyDown(field(), { key });
    }
    expect(field().getAttribute("aria-activedescendant")).toBe(
      "c-option-slovakia",
    );
    for (const key of ["v", "e"]) {
      fireEvent.keyDown(field(), { key });
    }
    expect(field().getAttribute("aria-activedescendant")).toBe(
      "c-option-slovenia",
    );
    expect(field().readOnly).toBe(true);
  });

  it("follows more letters typed in a row, and the same letter again goes on through its options", () => {
    render(<Countries />);
    fireEvent.keyDown(field(), { key: "b" });
    fireEvent.keyDown(field(), { key: "r" });
    expect(active()).toBe("country-option-brazil");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5000);
    fireEvent.keyDown(field(), { key: "a" });
    fireEvent.keyDown(field(), { key: "a" });
    expect(active()).toBe("country-option-algeria");
  });

  it("steps by letter with the arrows and the toolbar's buttons, which leave the focus on the field", () => {
    render(<Countries />);
    fireEvent.keyDown(field(), { key: "Enter" });
    fireEvent.keyDown(field(), { key: "ArrowRight" });
    expect(active()).toBe("country-option-belgium");
    const next = letterButton(/nextLetter/i);
    expect(fireEvent.mouseDown(next)).toBe(false);
    fireEvent.click(next);
    expect(active()).toBe("country-option-chad");
    fireEvent.click(letterButton(/previousLetter/i));
    expect(active()).toBe("country-option-belgium");
    fireEvent.keyDown(field(), { key: "ArrowLeft" });
    expect(active()).toBe("country-option-albania");
  });

  it("follows the writing direction: in right-to-left, Left is the next letter", () => {
    render(<Countries dir="rtl" />);
    fireEvent.keyDown(field(), { key: "Enter" });
    fireEvent.keyDown(field(), { key: "ArrowLeft" });
    expect(active()).toBe("country-option-belgium");
    fireEvent.keyDown(field(), { key: "ArrowRight" });
    expect(active()).toBe("country-option-albania");
  });

  it("moves a page with PageDown and PageUp and to the ends with Home and End", () => {
    render(<Countries />);
    fireEvent.keyDown(field(), { key: "Enter" });
    fireEvent.keyDown(field(), { key: "PageDown" });
    expect(active()).toBe("country-option-ghana");
    fireEvent.keyDown(field(), { key: "PageDown" });
    expect(active()).toBe("country-option-laos");
    fireEvent.keyDown(field(), { key: "PageUp" });
    expect(active()).toBe("country-option-denmark");
    fireEvent.keyDown(field(), { key: "Home" });
    expect(active()).toBe("country-option-albania");
    fireEvent.keyDown(field(), { key: "End" });
    expect(active()).toBe("country-option-laos");
  });

  it("keeps the active option in view as the keys move it", () => {
    render(<Countries />);
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    scrolled.mockClear();
    fireEvent.keyDown(field(), { key: "End" });
    expect(scrolled).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("opens on a space and picks with a space on an open list", () => {
    render(<Countries />);
    fireEvent.keyDown(field(), { key: " " });
    expect(isOpen()).toBe(true);
    fireEvent.keyDown(field(), { key: " " });
    expect(isOpen()).toBe(false);
    expect(field().value).toBe("Albania");
  });

  it("takes a space as part of a word only just after a letter; later it picks", () => {
    vi.useFakeTimers();
    render(<Countries />);
    fireEvent.keyDown(field(), { key: "j" });
    expect(active()).toBe("country-option-japan");
    vi.advanceTimersByTime(2000);
    fireEvent.keyDown(field(), { key: " " });
    expect(isOpen()).toBe(false);
    expect(field().value).toBe("Japan");
  });

  it("offers no letter steps on a short list", () => {
    render(<Picker />);
    fireEvent.focus(field());
    expect(screen.queryByRole("button", { name: /nextLetter/i })).toBeNull();
  });
});
