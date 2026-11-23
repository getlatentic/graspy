// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PinPad } from "./pin-pad";

afterEach(cleanup);

const onEntered = vi.fn();

function pad(props: Partial<Parameters<typeof PinPad>[0]> = {}) {
  onEntered.mockReset();
  return render(
    <PinPad
      label="Parent PIN"
      deleteLabel="Delete last digit"
      typedLabel={(count) => `${count} typed`}
      onEntered={onEntered}
      length={4}
      shuffle={false}
      {...props}
    />,
  );
}

const tap = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const tapAll = (digits: string) => [...digits].forEach(tap);
const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.body, { key, ...init });
const filled = () => document.querySelectorAll("[data-filled]").length;
const dots = () =>
  document.querySelectorAll('[aria-hidden="true"] > span').length;

describe("the PIN pad's keys", () => {
  it("are real buttons for the ten digits and for deleting, in a group with a name", () => {
    pad();

    expect(screen.getByRole("group", { name: "Parent PIN" })).toBeTruthy();
    for (const digit of "0123456789") {
      expect(
        screen.getByRole("button", { name: digit }).getAttribute("type"),
      ).toBe("button");
    }
    expect(
      screen.getByRole("button", { name: "Delete last digit" }),
    ).toBeTruthy();
  });

  it("put focus on the first key, where a remote starts", () => {
    pad();

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "1" }),
    );
  });

  it("take a tap, and send the PIN when the last digit of its length is typed", () => {
    pad();

    tapAll("482");
    expect(onEntered).not.toHaveBeenCalled();
    tap("7");

    expect(onEntered).toHaveBeenCalledTimes(1);
    expect(onEntered).toHaveBeenCalledWith("4827");
  });

  it("take no digit past the length", () => {
    pad();

    tapAll("48271");

    expect(onEntered).toHaveBeenCalledTimes(1);
    expect(filled()).toBe(4);
  });

  it("take the Enter key of a remote on the key in focus, as a tap", () => {
    pad();
    const five = screen.getByRole("button", { name: "5" });

    five.focus();
    fireEvent.click(five);

    expect(filled()).toBe(1);
  });

  it("delete the last digit, and do nothing with none typed", () => {
    pad();
    const erase = screen.getByRole("button", {
      name: "Delete last digit",
    }) as HTMLButtonElement;
    expect(erase.disabled).toBe(true);

    tapAll("48");
    fireEvent.click(erase);

    expect(filled()).toBe(1);
  });
});

describe("the PIN pad's keyboard", () => {
  it("takes number keys, from a keyboard or a remote, and Backspace", () => {
    pad();

    press("4");
    press("8");
    press("Backspace");
    press("9");
    press("2");
    press("7");

    expect(onEntered).toHaveBeenCalledWith("4927");
  });

  it("ignores other keys, repeats and shortcuts, and keys typed in a field", () => {
    pad();
    const field = document.createElement("input");
    document.body.append(field);

    press("a");
    press("Enter");
    press("5", { repeat: true });
    press("5", { ctrlKey: true });
    press("5", { metaKey: true });
    fireEvent.keyDown(field, { key: "5" });

    expect(filled()).toBe(0);
    field.remove();
  });

  it("takes no keys while an entry is being checked, and again after", () => {
    const { rerender } = pad({ busy: true });
    press("5");
    expect(filled()).toBe(0);

    rerender(
      <PinPad
        label="Parent PIN"
        deleteLabel="Delete last digit"
        typedLabel={(count) => `${count} typed`}
        onEntered={onEntered}
        length={4}
      />,
    );
    press("5");

    expect(filled()).toBe(1);
  });

  it("disables the keys while busy", () => {
    pad({ busy: true });

    expect(
      (screen.getByRole("button", { name: "5" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("the PIN pad shows only how many digits there are", () => {
  it("draws a dot for each digit of the length, filled as they are typed", () => {
    pad();
    expect(dots()).toBe(4);

    tapAll("48");

    expect(filled()).toBe(2);
  });

  it("puts no digit in the page, as text, a value or an attribute", () => {
    const { container } = pad();
    tapAll("4827".slice(0, 3));

    const html = container.innerHTML.replace(/>[0-9]</g, "><");
    expect(html).not.toMatch(/482/);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe("3 typed");
  });

  it("ignores a paste", () => {
    pad();
    const group = screen.getByRole("group");

    const pasted = fireEvent.paste(group);

    expect(pasted).toBe(false);
    expect(filled()).toBe(0);
  });

  it("keeps nothing in storage or the address", () => {
    const sets = vi.spyOn(Storage.prototype, "setItem");
    const before = window.location.href;
    pad();

    tapAll("4827");

    expect(sets).not.toHaveBeenCalled();
    expect(window.location.href).toBe(before);
    sets.mockRestore();
  });
});

describe("a PIN that was not accepted", () => {
  function Host() {
    const [failures, setFailures] = useState(0);
    return (
      <>
        <PinPad
          label="Parent PIN"
          deleteLabel="Delete last digit"
          typedLabel={() => ""}
          length={4}
          failures={failures}
          error={failures ? "Wrong PIN." : null}
          onEntered={onEntered}
        />
        <button type="button" onClick={() => setFailures((n) => n + 1)}>
          fail
        </button>
      </>
    );
  }

  it("is shown as an error, shakes the dots, and clears for another go", () => {
    render(<Host />);
    tapAll("4827");
    expect(filled()).toBe(4);

    fireEvent.click(screen.getByRole("button", { name: "fail" }));

    expect(screen.getByRole("alert").textContent).toBe("Wrong PIN.");
    expect(filled()).toBe(0);
    expect(document.querySelector(".animate-shake")).toBeTruthy();
    onEntered.mockClear();
    tapAll("1357");
    expect(onEntered).toHaveBeenCalledWith("1357");
  });
});

describe("a PIN of the person's own length", () => {
  it("shows the least number of dots, grows with the digits, and is sent by the button", () => {
    pad({ length: undefined, min: 4, max: 8, doneLabel: "Next" });
    const next = screen.getByRole("button", {
      name: "Next",
    }) as HTMLButtonElement;
    expect(dots()).toBe(4);
    expect(next.disabled).toBe(true);

    tapAll("48271");

    expect(dots()).toBe(5);
    expect(next.disabled).toBe(false);
    expect(onEntered).not.toHaveBeenCalled();
    fireEvent.click(next);
    expect(onEntered).toHaveBeenCalledWith("48271");
  });

  it("is sent by itself at the most digits it may have", () => {
    pad({ length: undefined, min: 4, max: 8, doneLabel: "Next" });

    tapAll("482719356");

    expect(onEntered).toHaveBeenCalledTimes(1);
    expect(onEntered).toHaveBeenCalledWith("48271935");
  });

  it("does not take a short one", () => {
    pad({ length: undefined, min: 4, max: 8, doneLabel: "Next" });
    tapAll("482");

    expect(
      (screen.getByRole("button", { name: "Next" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    act(() => undefined);
  });
});

describe("the PIN pad's shuffled keys", () => {
  const order = () =>
    [...screen.getAllByRole("button")]
      .map((button) => button.textContent ?? "")
      .filter((text) => /^[0-9]$/.test(text));

  it("are all ten digits, in a random order by default", () => {
    onEntered.mockReset();
    render(
      <PinPad
        label="Parent PIN"
        deleteLabel="Delete last digit"
        typedLabel={(count) => `${count} typed`}
        onEntered={onEntered}
        length={6}
      />,
    );

    expect([...order()].sort().join("")).toBe("0123456789");
    const seen = new Set<string>();
    for (let tries = 0; tries < 5; tries += 1) {
      cleanup();
      render(
        <PinPad
          label="Parent PIN"
          deleteLabel="Delete last digit"
          typedLabel={(count) => `${count} typed`}
          onEntered={onEntered}
          length={6}
        />,
      );
      seen.add(order().join(""));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("are in the usual order when asked, and the number keys of a keyboard are the same either way", () => {
    pad();
    expect(order().join("")).toBe("1234567890");
    cleanup();
    pad({ shuffle: true });

    press("4");
    press("8");
    press("2");
    press("7");

    expect(onEntered).toHaveBeenCalledWith("4827");
  });

  it("are shuffled again after a PIN that was not accepted", () => {
    function Host() {
      const [failures, setFailures] = useState(0);
      return (
        <>
          <PinPad
            label="Parent PIN"
            deleteLabel="Delete last digit"
            typedLabel={() => ""}
            length={6}
            failures={failures}
            onEntered={onEntered}
          />
          <button type="button" onClick={() => setFailures((n) => n + 1)}>
            fail
          </button>
        </>
      );
    }
    render(<Host />);
    const seen = new Set([order().join("")]);

    for (let tries = 0; tries < 5; tries += 1) {
      fireEvent.click(screen.getByRole("button", { name: "fail" }));
      seen.add(order().join(""));
    }

    expect(seen.size).toBeGreaterThan(1);
  });
});
