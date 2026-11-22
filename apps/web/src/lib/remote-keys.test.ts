// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { canStepBack, goBack, pushBack } from "./back-stack";
import { installRemoteInput } from "./remote-input";
import { isBack, remoteKey } from "./remote-keys";

afterEach(() => {
  document.body.innerHTML = "";
  delete document.documentElement.dataset.input;
  delete document.documentElement.dataset.device;
  vi.useRealTimers();
});

const key = (key: string, keyCode = 0) => ({ key, keyCode });

describe("remoteKey", () => {
  it("reads the five-way pad and OK", () => {
    expect(remoteKey(key("ArrowUp"))).toBe("up");
    expect(remoteKey(key("ArrowDown"))).toBe("down");
    expect(remoteKey(key("ArrowLeft"))).toBe("left");
    expect(remoteKey(key("ArrowRight"))).toBe("right");
    expect(remoteKey(key("Enter", 13))).toBe("select");
  });

  it("reads each make's Back key: webOS 461, Tizen 10009, Escape and the browser's GoBack", () => {
    expect(remoteKey(key("", 461))).toBe("back");
    expect(remoteKey(key("", 10009))).toBe("back");
    expect(remoteKey(key("Escape", 27))).toBe("back");
    expect(remoteKey(key("GoBack"))).toBe("back");
  });

  it("leaves media and colour keys alone", () => {
    for (const code of [415, 19, 413, 412, 417, 403, 404, 405, 406]) {
      expect(remoteKey(key("", code)), String(code)).toBeNull();
    }
    expect(remoteKey(key("a", 65))).toBeNull();
  });
});

describe("isBack", () => {
  it("counts a remote's Back key anywhere", () => {
    const field = document.createElement("input");
    expect(isBack({ ...key("", 461), target: field })).toBe(true);
  });

  it("counts Backspace only on a TV, and never in a field of text or on a control", () => {
    const field = document.createElement("input");
    const button = document.createElement("button");
    const select = document.createElement("select");
    const page = document.createElement("div");
    const backspace = (target: Element) => ({ ...key("Backspace", 8), target });
    expect(isBack(backspace(page), false)).toBe(false);
    expect(isBack(backspace(page), true)).toBe(true);
    expect(isBack(backspace(field), true)).toBe(false);
    expect(isBack(backspace(button), true)).toBe(false);
    expect(isBack(backspace(select), true)).toBe(false);
  });
});

describe("goBack", () => {
  const past = (idx: number | null) => ({
    back: vi.fn(),
    state: idx === null ? null : { idx },
  });

  it("knows the app's own history from the router's index, not from how many pages the browser holds", () => {
    expect(canStepBack({ state: { idx: 2 } })).toBe(true);
    expect(canStepBack({ state: { idx: 0 } })).toBe(false);
    expect(canStepBack({ state: null })).toBe(false);
  });

  it("closes the topmost popup first, then steps back, and stays on the first screen", () => {
    const history = past(3);
    const lower = vi.fn();
    const upper = vi.fn();
    const removeLower = pushBack(lower);
    const removeUpper = pushBack(upper);
    expect(goBack(history)).toBe("closed");
    expect(upper).toHaveBeenCalledOnce();
    expect(lower).not.toHaveBeenCalled();
    removeUpper();
    expect(goBack(history)).toBe("closed");
    expect(lower).toHaveBeenCalledOnce();
    removeLower();
    expect(goBack(history)).toBe("history");
    expect(history.back).toHaveBeenCalledOnce();
    const first = past(0);
    expect(goBack(first)).toBe("stayed");
    expect(first.back).not.toHaveBeenCalled();
  });

  it("only leaves a text field, which puts away the keyboard, and does not change screen", () => {
    const history = past(3);
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    expect(goBack(history, field)).toBe("blurred");
    expect(document.activeElement).not.toBe(field);
    expect(history.back).not.toHaveBeenCalled();
  });

  it("still closes an open popup before leaving a field", () => {
    const history = past(3);
    const field = document.createElement("input");
    const closed = vi.fn();
    const remove = pushBack(closed);
    expect(goBack(history, field)).toBe("closed");
    remove();
    expect(closed).toHaveBeenCalledOnce();
  });
});

const press = (
  target: EventTarget,
  init: KeyboardEventInit & { keyCode?: number },
) => {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  if (init.keyCode !== undefined) {
    Object.defineProperty(event, "keyCode", { value: init.keyCode });
  }
  target.dispatchEvent(event);
  return event;
};

describe("installRemoteInput", () => {
  it("marks the page as driven by a remote on a key that moves focus, and clears it for a pointer", () => {
    const stop = installRemoteInput();
    press(document, { key: "ArrowDown" });
    expect(document.documentElement.dataset.input).toBe("remote");
    document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(document.documentElement.dataset.input).toBeUndefined();
    stop();
  });

  it("clears it for a mousemove that carries no movement, once it is not just the page scrolling", () => {
    vi.useFakeTimers();
    const stop = installRemoteInput();
    press(document, { key: "ArrowDown" });
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(document.documentElement.dataset.input).toBe("remote");
    vi.advanceTimersByTime(400);
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(document.documentElement.dataset.input).toBeUndefined();
    stop();
  });

  it("makes the Back keys of a TV close what is open and swallows them", () => {
    const stop = installRemoteInput();
    const closed = vi.fn();
    const remove = pushBack(closed);
    for (const keyCode of [461, 10009]) {
      const event = press(document, { key: "", keyCode });
      expect(event.defaultPrevented, String(keyCode)).toBe(true);
    }
    expect(closed).toHaveBeenCalledTimes(2);
    remove();
    stop();
  });

  it("ignores a held Back key and Back with a modifier", () => {
    const stop = installRemoteInput();
    const closed = vi.fn();
    const remove = pushBack(closed);
    press(document, { key: "", keyCode: 461, repeat: true });
    press(document, { key: "", keyCode: 461, ctrlKey: true });
    press(document, { key: "", keyCode: 461, altKey: true });
    press(document, { key: "", keyCode: 461, metaKey: true });
    expect(closed).not.toHaveBeenCalled();
    remove();
    stop();
  });

  it("takes Backspace as Back only on a TV, and not on a control", () => {
    const stop = installRemoteInput();
    const closed = vi.fn();
    const remove = pushBack(closed);
    const page = document.createElement("div");
    const button = document.createElement("button");
    document.body.append(page, button);
    press(page, { key: "Backspace" });
    expect(closed).not.toHaveBeenCalled();
    document.documentElement.dataset.device = "tv";
    press(button, { key: "Backspace" });
    expect(closed).not.toHaveBeenCalled();
    press(page, { key: "Backspace" });
    expect(closed).toHaveBeenCalledOnce();
    remove();
    stop();
  });

  it("only leaves a text field on Back: no history step, the field blurs", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const stop = installRemoteInput();
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    const event = press(field, { key: "", keyCode: 10009 });
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(field);
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
    stop();
  });

  it("leaves Escape to the popups that handle it themselves", () => {
    const stop = installRemoteInput();
    const closed = vi.fn();
    const remove = pushBack(closed);
    const event = press(document, { key: "Escape" });
    expect(closed).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    remove();
    stop();
  });
});
