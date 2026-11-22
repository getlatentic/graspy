// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { haptics } from "@/features/haptics/lib/haptics";
import { installSelectSound } from "@/features/haptics/lib/select-sound";
import { KeysApp } from "@/test/keys-app";
import { ASKED } from "@/lib/voice/voice-worker.fake";
import { AnswerControls } from "./answer-controls";

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
  it("press (feel and sound) when Record is tapped, and only then start recording", async () => {
    const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
    const { onRecord } = controls("your-turn");
    await userEvent.click(screen.getAllByRole("button")[0]);
    expect(trigger).toHaveBeenCalledExactlyOnceWith("press");
    expect(onRecord).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onRecord).toHaveBeenCalledOnce());
  });

  it("keep the microphone's button out of the select sound, with the page's click handler installed", async () => {
    const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
    const uninstall = installSelectSound(haptics);
    controls("your-turn");
    await userEvent.click(screen.getAllByRole("button")[0]);
    expect(trigger.mock.calls).toEqual([["press"]]);
    await userEvent.click(screen.getAllByRole("button")[1]);
    expect(trigger.mock.calls).toEqual([["press"], ["select"]]);
    uninstall();
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
