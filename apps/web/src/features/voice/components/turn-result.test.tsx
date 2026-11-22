// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { haptics } from "@/features/haptics/lib/haptics";
import { KeysApp } from "@/test/keys-app";
import type { MarkedTurn } from "@/lib/voice/voice-types";
import { TurnResult } from "./turn-result";

afterEach(cleanup);

const turn: MarkedTurn = {
  sample_id: "s1",
  state: "complete",
  transcript: "three",
  decision: "correct",
  feedback: "Well done.",
  provider: "test",
  latency_ms: 1,
};

describe("a shown result", () => {
  it("is never felt by showing it, nor by showing it again", () => {
    const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
    const { rerender, unmount } = render(
      <KeysApp>
        <TurnResult turn={turn} />
      </KeysApp>,
    );
    rerender(
      <KeysApp>
        <TurnResult turn={{ ...turn, decision: "try_again" }} />
      </KeysApp>,
    );
    unmount();
    render(
      <KeysApp>
        <TurnResult turn={turn} />
      </KeysApp>,
    );
    expect(screen.getByRole("status")).toBeTruthy();
    expect(trigger).not.toHaveBeenCalled();
  });
});
