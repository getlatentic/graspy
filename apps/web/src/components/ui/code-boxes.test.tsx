// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeBoxes } from "./code-boxes";

afterEach(cleanup);

function boxes(length: number, onComplete = vi.fn(), disabled = false) {
  render(
    <CodeBoxes
      length={length}
      label="Code"
      onComplete={onComplete}
      disabled={disabled}
    />,
  );
  return {
    onComplete,
    fields: screen.getAllByRole("textbox") as HTMLInputElement[],
  };
}

const type = (fields: HTMLInputElement[], index: number, value: string) =>
  fireEvent.change(fields[index], { target: { value } });

describe("code boxes", () => {
  it("has a box for each character, labelled for a screen reader, the first one focused", () => {
    const { fields } = boxes(4);

    expect(fields).toHaveLength(4);
    expect(fields.map((box) => box.getAttribute("aria-label"))).toEqual([
      "Code 1",
      "Code 2",
      "Code 3",
      "Code 4",
    ]);
    expect(screen.getByRole("group", { name: "Code" })).toBeTruthy();
    expect(document.activeElement).toBe(fields[0]);
  });

  it("asks the phone for capitals and no autocorrect", () => {
    const { fields } = boxes(4);

    for (const box of fields) {
      expect(box.getAttribute("autocapitalize")).toBe("characters");
      expect(box.getAttribute("autocorrect")).toBe("off");
      expect(box.getAttribute("autocomplete")).toBe("off");
    }
  });

  it("shows capitals, moves on after each character, and is complete on the last, once", () => {
    const { fields, onComplete } = boxes(4);

    type(fields, 0, "a");
    expect(document.activeElement).toBe(fields[1]);
    type(fields, 1, "b");
    type(fields, 2, "9");
    expect(onComplete).not.toHaveBeenCalled();
    type(fields, 3, "z");

    expect(fields.map((box) => box.value)).toEqual(["A", "B", "9", "Z"]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("AB9Z");
  });

  it("ignores what is not a letter or a digit", () => {
    const { fields, onComplete } = boxes(4);

    type(fields, 0, "-");
    type(fields, 0, " ");

    expect(fields[0].value).toBe("");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("goes back a box on Backspace in an empty one, and clears it", () => {
    const { fields } = boxes(4);
    type(fields, 0, "a");
    type(fields, 1, "b");
    expect(document.activeElement).toBe(fields[2]);

    fireEvent.keyDown(fields[2], { key: "Backspace" });

    expect(document.activeElement).toBe(fields[1]);
    expect(fields[1].value).toBe("");
    expect(fields[0].value).toBe("A");
  });

  it("takes a paste, dropping spaces and dashes, and fills the rest from the box it lands in", () => {
    const { fields, onComplete } = boxes(4);

    fireEvent.paste(fields[0], {
      clipboardData: { getData: () => " ab-9z " },
    });

    expect(fields.map((box) => box.value)).toEqual(["A", "B", "9", "Z"]);
    expect(onComplete).toHaveBeenCalledWith("AB9Z");
  });

  it("takes an autofill of the whole code into one box", () => {
    const { fields, onComplete } = boxes(4);

    type(fields, 0, "ab9z");

    expect(onComplete).toHaveBeenCalledWith("AB9Z");
  });

  it("puts the end of a longer paste in the boxes, so a whole code pasted into four takes its last four", () => {
    const { fields, onComplete } = boxes(4);

    fireEvent.paste(fields[2], {
      clipboardData: { getData: () => "ZHGK-MAHV" },
    });

    expect(fields.map((box) => box.value)).toEqual(["M", "A", "H", "V"]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("MAHV");
  });

  it("takes the last four of a whole code autofilled into one box", () => {
    const { fields, onComplete } = boxes(4);

    type(fields, 0, "ZHGKMAHV");

    expect(onComplete).toHaveBeenCalledWith("MAHV");
  });

  it("goes back a box when a soft keyboard deletes in an empty one, as an edit and not a key", () => {
    const { fields } = boxes(4);
    type(fields, 0, "a");
    type(fields, 1, "b");
    expect(document.activeElement).toBe(fields[2]);

    const edit = new InputEvent("beforeinput", {
      inputType: "deleteContentBackward",
      cancelable: true,
      bubbles: true,
    });
    act(() => {
      fields[2].dispatchEvent(edit);
    });

    expect(edit.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(fields[1]);
    expect(fields[1].value).toBe("");
    expect(fields[0].value).toBe("A");
  });

  it("leaves a deletion in a box that holds a character to the box", () => {
    const { fields } = boxes(4);
    type(fields, 0, "a");
    fields[0].focus();

    const edit = new InputEvent("beforeinput", {
      inputType: "deleteContentBackward",
      cancelable: true,
      bubbles: true,
    });
    fields[0].dispatchEvent(edit);

    expect(edit.defaultPrevented).toBe(false);
  });

  it("waits for an input method to finish composing before it takes what was typed", () => {
    const { fields, onComplete } = boxes(4);

    fireEvent.compositionStart(fields[0]);
    fireEvent.change(fields[0], { target: { value: "ｎ" } });
    expect(fields[0].value).toBe("");
    fireEvent.change(fields[0], { target: { value: "ｎａ" } });
    expect(fields[0].value).toBe("");
    fireEvent.compositionEnd(fields[0], { target: { value: "ｎａ" } });

    expect(fields[0].value).toBe("N");
    expect(fields[1].value).toBe("A");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("reads digits written in other scripts as the digits they are, not as nothing", () => {
    const { fields, onComplete } = boxes(4);

    fireEvent.paste(fields[0], {
      clipboardData: { getData: () => "٢٣٤٥" },
    });

    expect(fields.map((box) => box.value)).toEqual(["2", "3", "4", "5"]);
    expect(onComplete).toHaveBeenCalledWith("2345");
  });

  it("reads Persian and full-width digits too", () => {
    const { fields, onComplete } = boxes(4);

    fireEvent.paste(fields[0], {
      clipboardData: { getData: () => "۲３４۵" },
    });

    expect(onComplete).toHaveBeenCalledWith("2345");
    expect(fields.map((box) => box.value)).toEqual(["2", "3", "4", "5"]);
  });

  it("completes once for a value, not again for the same value typed over itself", () => {
    const { fields, onComplete } = boxes(4);
    type(fields, 0, "ab9z");
    expect(onComplete).toHaveBeenCalledTimes(1);

    type(fields, 3, "z");
    type(fields, 3, "Z");

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("completes again for a different value, after one box is changed", () => {
    const { fields, onComplete } = boxes(4);
    type(fields, 0, "ab9z");

    type(fields, 3, "x");

    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenLastCalledWith("AB9X");
  });

  it("never completes on a half-typed value", () => {
    const { fields, onComplete } = boxes(4);

    type(fields, 0, "a");
    type(fields, 1, "b");
    type(fields, 2, "9");
    fireEvent.keyDown(fields[3], { key: "Enter" });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it("can leave the first box unfocused, and says what describes it", () => {
    render(
      <>
        <p id="why">Type them</p>
        <CodeBoxes
          length={4}
          label="Code"
          onComplete={vi.fn()}
          autoFocus={false}
          describedBy="why"
        />
      </>,
    );
    const fields = screen.getAllByRole("textbox");

    expect(document.activeElement).not.toBe(fields[0]);
    expect(screen.getByRole("group").getAttribute("aria-describedby")).toBe(
      "why",
    );
  });

  it("types a character over one already there, whichever way the keyboard reports it", () => {
    const { fields } = boxes(4);
    type(fields, 0, "a");
    fireEvent.focus(fields[0]);

    type(fields, 0, "bA");

    expect(fields[0].value).toBe("B");
  });

  it("has as many boxes as a whole code needs", () => {
    const { fields, onComplete } = boxes(8);

    type(fields, 0, "abcd2345");

    expect(fields).toHaveLength(8);
    expect(onComplete).toHaveBeenCalledWith("ABCD2345");
  });

  it("takes nothing while disabled", () => {
    const { fields } = boxes(4, vi.fn(), true);

    expect(fields.every((box) => box.disabled)).toBe(true);
  });
});
