// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installSelectSound } from "./select-sound";

const trigger = vi.fn();
let remove: () => void;

beforeEach(() => {
  trigger.mockClear();
  remove = installSelectSound({ trigger });
});
afterEach(() => {
  remove();
  document.body.innerHTML = "";
});

function page(html: string) {
  document.body.innerHTML = html;
  return document.body;
}

const click = (element: Element | null) =>
  element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

describe("the select sound", () => {
  it.each([
    "<button>Go</button>",
    '<a href="/subjects/maths">Maths</a>',
    '<div role="option">Class 3</div>',
    '<div role="tab">Topics</div>',
    '<button role="switch" aria-checked="false">Sounds</button>',
    '<input type="checkbox">',
  ])("selects for a click on %s", (html) => {
    const body = page(html);
    click(body.firstElementChild);
    expect(trigger).toHaveBeenCalledExactlyOnceWith("select");
  });

  it("selects for a click on what is inside a button", () => {
    const body = page("<button><svg></svg><span>Next</span></button>");
    click(body.querySelector("span"));
    expect(trigger).toHaveBeenCalledOnce();
  });

  it("is silent for the microphone's button and anything inside data-no-sound", () => {
    const body = page(
      "<button data-no-sound>Record</button><div data-no-sound><button>Inner</button></div>",
    );
    click(body.querySelector("button"));
    click(body.querySelector("div button"));
    expect(trigger).not.toHaveBeenCalled();
  });

  it("is silent for a disabled control, plain text and a text field", () => {
    const body = page(
      '<button disabled>No</button><button aria-disabled="true">No</button><p>Words</p><input type="text">',
    );
    for (const element of Array.from(body.children)) click(element);
    expect(trigger).not.toHaveBeenCalled();
  });

  it("ticks for a click on a select's field, which opens its list, and not for focusing it", () => {
    const body = page(
      '<input role="combobox" readonly aria-expanded="false"><input role="combobox" disabled>',
    );
    const [field, disabled] = Array.from(body.querySelectorAll("input"));
    field.focus();
    expect(trigger).not.toHaveBeenCalled();
    click(field);
    expect(trigger).toHaveBeenCalledExactlyOnceWith("select");
    click(disabled);
    expect(trigger).toHaveBeenCalledOnce();
  });

  it("ticks a select's field only when the press opens its list, not for a click on an open field or in its text", () => {
    const body = page('<input role="combobox" aria-expanded="false">');
    const field = body.firstElementChild as HTMLInputElement;
    const press = () =>
      field.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));

    // A press on a closed field: focus opens it before the click arrives.
    press();
    field.setAttribute("aria-expanded", "true");
    click(field);
    expect(trigger).toHaveBeenCalledOnce();

    // A press and a click on the field that is already open (a caret click while typing).
    trigger.mockClear();
    press();
    click(field);
    expect(trigger).not.toHaveBeenCalled();

    // A click with no press seen reads the field as it is.
    click(field);
    expect(trigger).not.toHaveBeenCalled();
    field.setAttribute("aria-expanded", "false");
    click(field);
    expect(trigger).toHaveBeenCalledOnce();
  });

  it("is silent for focus, hover, typing and the remote's arrow keys", () => {
    const body = page("<button>One</button><button>Two</button>");
    const [one, two] = Array.from(body.querySelectorAll("button"));
    one.focus();
    two.focus();
    for (const type of ["mouseover", "pointerenter", "pointermove", "scroll"]) {
      two.dispatchEvent(new Event(type, { bubbles: true }));
    }
    for (const key of ["ArrowDown", "ArrowRight", "a", "Tab"]) {
      two.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      two.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    }
    expect(trigger).not.toHaveBeenCalled();
  });

  it("stops listening once removed", () => {
    const body = page("<button>Go</button>");
    remove();
    click(body.firstElementChild);
    expect(trigger).not.toHaveBeenCalled();
  });
});
