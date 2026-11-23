// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetInput,
  MOVE_PX,
  noteInput,
  noteUserInput,
  sinceInput,
  trackInput,
} from "./tv-presence";

let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  forgetInput();
});

afterEach(() => {
  stop?.();
  vi.useRealTimers();
});

const everything = () => true;
const nothing = () => false;
const seen = () => sinceInput() !== null;

function move(x: number, y: number) {
  document.dispatchEvent(
    new MouseEvent("pointermove", { screenX: x, screenY: y, bubbles: true }),
  );
}

describe("what counts as input", () => {
  it.each(["keydown", "pointerdown", "touchstart", "wheel"])(
    "counts %s from a person",
    (name) => {
      stop = trackInput(document, everything);

      document.dispatchEvent(new Event(name, { bubbles: true }));

      expect(seen()).toBe(true);
    },
  );

  it.each(["keyup", "click", "mouseover", "scroll", "focus", "pointerup"])(
    "does not count %s",
    (name) => {
      stop = trackInput(document, everything);

      document.dispatchEvent(new Event(name, { bubbles: true }));

      expect(seen()).toBe(false);
    },
  );

  it.each(["keydown", "pointerdown", "touchstart", "wheel"])(
    "does not count %s that a script made, which the browser marks untrusted, by default",
    (name) => {
      stop = trackInput();

      document.dispatchEvent(new Event(name, { bubbles: true }));

      expect(seen()).toBe(false);
    },
  );

  it("does not count pointer movement a script made", () => {
    stop = trackInput();

    move(0, 0);
    move(500, 500);

    expect(seen()).toBe(false);
  });

  it("asks the predicate, so a trusted event counts and an untrusted does not", () => {
    stop = trackInput(document, nothing);
    document.dispatchEvent(new Event("keydown", { bubbles: true }));
    expect(seen()).toBe(false);
    stop();

    stop = trackInput(document, everything);
    document.dispatchEvent(new Event("keydown", { bubbles: true }));
    expect(seen()).toBe(true);
  });

  it("stops noting when it is stopped", () => {
    stop = trackInput(document, everything);
    stop();

    document.dispatchEvent(new Event("keydown", { bubbles: true }));

    expect(seen()).toBe(false);
  });
});

describe("pointer movement", () => {
  beforeEach(() => {
    stop = trackInput(document, everything);
  });

  it("is not input until the pointer has moved by the threshold from where it was first seen", () => {
    move(100, 100);
    expect(seen()).toBe(false);

    move(100 + MOVE_PX - 1, 100);
    expect(seen()).toBe(false);
    move(100 + MOVE_PX, 100);

    expect(seen()).toBe(true);
    expect(MOVE_PX).toBe(8);
  });

  it("counts a vertical move as well as a horizontal one", () => {
    move(0, 0);

    move(0, MOVE_PX);

    expect(seen()).toBe(true);
  });

  it("does not count a pointer standing still, however many events a re-rendering screen makes", () => {
    move(300, 300);
    for (let second = 0; second < 600; second += 1) {
      vi.advanceTimersByTime(1_000);
      move(300, 300);
    }

    expect(seen()).toBe(false);
  });

  it("does not count jitter inside the threshold", () => {
    move(300, 300);
    for (let n = 0; n < 50; n += 1) move(300 + (n % 3), 300 - (n % 2));

    expect(seen()).toBe(false);
  });

  it("measures from the last counted position, so a slow drift that adds up does count", () => {
    move(0, 0);
    move(3, 0);
    move(6, 0);
    expect(seen()).toBe(false);

    move(9, 0);

    expect(seen()).toBe(true);
  });

  it("counts real movement again after standing still, each time it goes the threshold", () => {
    move(0, 0);
    move(50, 0);
    vi.advanceTimersByTime(60_000);
    expect(sinceInput()).toBe(60_000);

    move(50, 1);
    expect(sinceInput()).toBe(60_000);
    move(100, 0);

    expect(sinceInput()).toBe(0);
  });
});

describe("the monotonic clock", () => {
  it("measures how long ago the input was, on performance.now", () => {
    noteInput();

    vi.advanceTimersByTime(45_000);

    expect(sinceInput()).toBe(45_000);
  });

  it("is not moved by the wall clock changing, either way", () => {
    noteInput();
    vi.advanceTimersByTime(10_000);

    vi.setSystemTime(Date.now() - 3_600_000);
    expect(sinceInput()).toBe(10_000);
    vi.setSystemTime(Date.now() + 7_200_000);
    expect(sinceInput()).toBe(10_000);
  });

  it("says nothing, not zero, when the clock reads earlier than the input", () => {
    noteInput(5_000);

    expect(sinceInput(4_000)).toBeNull();
    expect(sinceInput(5_000)).toBe(0);
  });

  it("says nothing before any input", () => {
    expect(sinceInput()).toBeNull();
  });

  it("forgets", () => {
    noteInput();
    forgetInput();

    expect(sinceInput()).toBeNull();
  });
});

describe("noteUserInput, for the controls that start or restart the flow", () => {
  it("notes the event of a person", () => {
    noteUserInput({ isTrusted: true });

    expect(seen()).toBe(true);
  });

  it("does not note an event a script made", () => {
    noteUserInput({ isTrusted: false });

    expect(seen()).toBe(false);
  });

  it("does not note a real, untrusted click", () => {
    const link = document.createElement("a");
    link.addEventListener("click", noteUserInput);

    link.dispatchEvent(new MouseEvent("click"));

    expect(seen()).toBe(false);
  });
});
