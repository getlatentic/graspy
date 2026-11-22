// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { haptics } from "@/features/haptics/lib/haptics";
import { installSelectSound } from "@/features/haptics/lib/select-sound";
import { KeysApp } from "@/test/keys-app";
import { ASKED } from "@/lib/voice/voice-worker.fake";
import { AnswerControls, PRESS_LEAD_MS } from "./answer-controls";

afterEach(cleanup);

function controls(phase: "your-turn" | "recording") {
  const handlers = {
    onRecord: vi.fn(),
    onStop: vi.fn(),
    onHearAgain: vi.fn(),
    onCarryOn: vi.fn(),
  };
  render(
    <KeysApp>
      <AnswerControls
        phase={{ name: phase, move: ASKED }}
        levels={[]}
        {...handlers}
      />
    </KeysApp>,
  );
  return handlers;
}

describe("the answer controls", () => {
  describe("Record", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("presses (feel and sound) when tapped, and starts recording only after the lead", () => {
      const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
      const { onRecord } = controls("your-turn");
      fireEvent.click(screen.getAllByRole("button")[0]);
      expect(trigger).toHaveBeenCalledExactlyOnceWith("press");
      vi.advanceTimersByTime(PRESS_LEAD_MS - 1);
      expect(onRecord).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onRecord).toHaveBeenCalledOnce();
    });

    it("starts one take for a double tap", () => {
      const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
      const { onRecord } = controls("your-turn");
      const record = screen.getAllByRole("button")[0];
      fireEvent.click(record);
      vi.advanceTimersByTime(PRESS_LEAD_MS / 2);
      fireEvent.click(record);
      vi.advanceTimersByTime(PRESS_LEAD_MS * 2);
      expect(onRecord).toHaveBeenCalledOnce();
      expect(trigger).toHaveBeenCalledOnce();
    });

    it("can be tapped again once the first take has been asked for", () => {
      const { onRecord } = controls("your-turn");
      const record = screen.getAllByRole("button")[0];
      fireEvent.click(record);
      vi.advanceTimersByTime(PRESS_LEAD_MS);
      fireEvent.click(record);
      vi.advanceTimersByTime(PRESS_LEAD_MS);
      expect(onRecord).toHaveBeenCalledTimes(2);
    });

    it("starts no take when the controls go away before the lead is over", () => {
      const { onRecord } = controls("your-turn");
      fireEvent.click(screen.getAllByRole("button")[0]);
      cleanup();
      vi.advanceTimersByTime(PRESS_LEAD_MS * 2);
      expect(onRecord).not.toHaveBeenCalled();
    });
  });

  it("keep the microphone's button out of the select sound, with the page's click handler installed", async () => {
    const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
    const uninstall = installSelectSound(haptics);
    try {
      controls("your-turn");
      await userEvent.click(screen.getAllByRole("button")[0]);
      expect(trigger.mock.calls).toEqual([["press"]]);
      await userEvent.click(screen.getAllByRole("button")[1]);
      expect(trigger.mock.calls).toEqual([["press"], ["select"]]);
    } finally {
      uninstall();
    }
  });

  it("do not buzz for hearing it again or for finishing speaking", async () => {
    const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
    const again = controls("your-turn");
    await userEvent.click(screen.getAllByRole("button")[1]);
    expect(again.onHearAgain).toHaveBeenCalledOnce();
    cleanup();
    const done = controls("recording");
    await userEvent.click(screen.getByRole("button"));
    expect(done.onStop).toHaveBeenCalledOnce();
    expect(trigger).not.toHaveBeenCalled();
  });
});
