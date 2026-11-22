// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { goBack, pushBack } from "./back-stack";
import { installRemoteInput } from "./remote-input";
import { isBack, remoteKey } from "./remote-keys";

afterEach(() => {
  document.body.innerHTML = "";
  delete document.documentElement.dataset.input;
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
  it("counts Backspace as Back only outside a field of text", () => {
    const field = document.createElement("input");
    const button = document.createElement("button");
    expect(isBack({ ...key("Backspace", 8), target: field })).toBe(false);
    expect(isBack({ ...key("Backspace", 8), target: button })).toBe(true);
    expect(isBack({ ...key("", 461), target: field })).toBe(true);
  });
});

describe("goBack", () => {
  it("closes the topmost popup first, then steps back, and stays on the first screen", () => {
    const history = { length: 3, back: vi.fn() };
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
    expect(goBack({ length: 1, back: history.back })).toBe("stayed");
    expect(history.back).toHaveBeenCalledOnce();
  });
});

describe("installRemoteInput", () => {
  it("marks the page as driven by a remote on a key that moves focus, and clears it for a pointer", () => {
    const stop = installRemoteInput();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.documentElement.dataset.input).toBe("remote");
    document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(document.documentElement.dataset.input).toBeUndefined();
    stop();
  });

  it("makes the Back keys of a TV close what is open and swallows them", () => {
    const stop = installRemoteInput();
    const closed = vi.fn();
    const remove = pushBack(closed);
    for (const keyCode of [461, 10009]) {
      const event = new KeyboardEvent("keydown", {
        key: "",
        keyCode,
        bubbles: true,
        cancelable: true,
      } as KeyboardEventInit);
      Object.defineProperty(event, "keyCode", { value: keyCode });
      document.dispatchEvent(event);
      expect(event.defaultPrevented, String(keyCode)).toBe(true);
    }
    expect(closed).toHaveBeenCalledTimes(2);
    remove();
    stop();
  });

  it("leaves Escape to the popups that handle it themselves", () => {
    const stop = installRemoteInput();
    const closed = vi.fn();
    const remove = pushBack(closed);
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(closed).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    remove();
    stop();
  });
});
