// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_WIDTH,
  DEFAULT_LAYOUT,
  KEY_STEP,
  clampChatWidth,
  loadLayout,
  parseLayout,
  saveLayout,
  widthAfterKey,
} from "./pane-layout";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("clampChatWidth", () => {
  it("keeps the conversation between its smallest and widest", () => {
    expect(clampChatWidth(10)).toBe(CHAT_WIDTH.min);
    expect(clampChatWidth(5000)).toBe(CHAT_WIDTH.max);
    expect(clampChatWidth(400.6)).toBe(401);
  });
});

describe("widthAfterKey", () => {
  it("widens the conversation with the arrow that points away from it", () => {
    expect(widthAfterKey("ArrowLeft", 400, false)).toBe(400 + KEY_STEP);
    expect(widthAfterKey("ArrowRight", 400, false)).toBe(400 - KEY_STEP);
  });

  it("turns the arrows round when the page reads right to left", () => {
    expect(widthAfterKey("ArrowRight", 400, true)).toBe(400 + KEY_STEP);
    expect(widthAfterKey("ArrowLeft", 400, true)).toBe(400 - KEY_STEP);
  });

  it("stops at the ends and jumps to them with Home and End", () => {
    expect(widthAfterKey("ArrowLeft", CHAT_WIDTH.max, false)).toBe(
      CHAT_WIDTH.max,
    );
    expect(widthAfterKey("ArrowRight", CHAT_WIDTH.min, false)).toBe(
      CHAT_WIDTH.min,
    );
    expect(widthAfterKey("Home", 400, false)).toBe(CHAT_WIDTH.min);
    expect(widthAfterKey("End", 400, false)).toBe(CHAT_WIDTH.max);
  });

  it("ignores every other key", () => {
    expect(widthAfterKey("Enter", 400, false)).toBeNull();
    expect(widthAfterKey("a", 400, false)).toBeNull();
  });
});

describe("parseLayout", () => {
  it("is the default for nothing, for text that is not JSON, and for JSON that is not a layout", () => {
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout("{nope")).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout("42")).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout("null")).toEqual(DEFAULT_LAYOUT);
  });

  it("keeps what is valid and defaults and clamps the rest", () => {
    expect(
      parseLayout(
        JSON.stringify({ menuOpen: false, chatOpen: "yes", chatWidth: 99999 }),
      ),
    ).toEqual({
      menuOpen: false,
      chatOpen: DEFAULT_LAYOUT.chatOpen,
      chatWidth: CHAT_WIDTH.max,
    });
  });

  it("does not trust a width that is not a number", () => {
    expect(parseLayout(JSON.stringify({ chatWidth: "wide" })).chatWidth).toBe(
      DEFAULT_LAYOUT.chatWidth,
    );
  });
});

describe("the stored layout", () => {
  it("comes back as it was saved", () => {
    const layout = { menuOpen: false, chatOpen: false, chatWidth: 480 };
    saveLayout(layout);
    expect(loadLayout()).toEqual(layout);
  });

  it("is the default, and not an error, where storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
    expect(() => saveLayout(DEFAULT_LAYOUT)).not.toThrow();
  });
});
